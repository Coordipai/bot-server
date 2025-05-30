import os
import discord
import requests
from discord.ext import commands
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from discord import app_commands
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL")

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="/", intents=intents)
scheduler = AsyncIOScheduler()

@bot.event
async def on_ready():
    print(f"{bot.user} has connected to Discord!")
    scheduler.start()
    scheduler.add_job(send_daily_issues_by_number, 'cron', hour=9, minute=0)
    scheduler.add_job(send_daily_issues_by_repo, 'cron', hour=9, minute=0)
    try:
        synced = await bot.tree.sync()
        print(f"Slash commands synced: {[cmd.name for cmd in synced]}")
    except Exception as e:
        print(e)

# 기능 1 - issue_number로 DM
async def send_daily_issues_by_number():
    for guild in bot.guilds:
        res = requests.get(f"{BACKEND_BASE_URL}/issue", params={"guild_id": guild.id})
        if res.status_code != 200: continue
        for issue in res.json():
            for assignee in issue.get("assignees", []):
                member = guild.get_member(int(assignee["discord_id"]))
                if member:
                    await member.send(f"[Issue #{issue['issue_number']}] {issue['title']}")

# 기능 2 - repo_fullname으로 DM
async def send_daily_issues_by_repo():
    for guild in bot.guilds:
        res = requests.get(f"{BACKEND_BASE_URL}/issue", params={"guild_id": guild.id})
        if res.status_code != 200: continue
        for issue in res.json():
            for assignee in issue.get("assignees", []):
                member = guild.get_member(int(assignee["discord_id"]))
                if member:
                    await member.send(f"[{issue['repo_fullname']}] {issue['title']}")

# # 기능 3 - /request 슬래시 커맨드 + 모달 UI
# @bot.tree.command(name="request", description="이슈 일정 변경 요청")
# async def request_command(interaction: discord.Interaction):
#     guild_id = interaction.guild_id
#     user_id = interaction.user.id

#     try:
#         res = requests.get(f"{BACKEND_BASE_URL}/project", params={"guild_id": guild_id})
#         project = res.json()
#         members = project.get("members", [])
#     except Exception as e:
#         await interaction.response.send_message("서버에서 멤버 정보를 불러오는 데 실패했습니다.", ephemeral=True)
#         return

#     class RequestModal(discord.ui.Modal, title="이슈 일정 변경 요청"):
#         issue_number = discord.ui.TextInput(label="이슈 번호", placeholder="예: 101", required=True)
#         reason = discord.ui.TextInput(label="변경 사유", style=discord.TextStyle.paragraph, required=True)

#         def __init__(self, member_options):
#             super().__init__()
#             self.selected_members = []
#             self.member_select = discord.ui.Select(
#                 placeholder="맴버 선택",
#                 min_values=1,
#                 max_values=len(member_options),
#                 options=[
#                     discord.SelectOption(label=m["name"], value=m["discord_id"]) for m in member_options
#                 ]
#             )
#             self.add_item(self.member_select)

#         async def on_submit(self, interaction: discord.Interaction):
#             self.selected_members = self.member_select.values
#             payload = {
#                 "issue_number": self.issue_number.value,
#                 "reason": self.reason.value,
#                 "members": self.selected_members
#             }
#             response = requests.post(
#                 f"{BACKEND_BASE_URL}/issue-reschedule",
#                 params={"guild_id": guild_id, "discord_id": user_id},
#                 json=payload
#             )
#             if response.status_code == 200:
#                 await interaction.response.send_message("✅ 일정 변경 요청 완료!", ephemeral=True)
#             else:
#                 await interaction.response.send_message("❌ 요청 실패!", ephemeral=True)

#     await interaction.response.send_modal(RequestModal(members))

@bot.tree.command(name="request", description="이슈 일정 변경 요청 (TextInput만)")
async def request_command(interaction: discord.Interaction):
    class RequestModal(discord.ui.Modal, title="이슈 일정 변경 요청"):
        issue_number = discord.ui.TextInput(label="이슈 번호", placeholder="예: 101", required=True)
        reason = discord.ui.TextInput(label="변경 사유", style=discord.TextStyle.paragraph, required=True)
        members = discord.ui.TextInput(label="맴버 Discord ID들 (쉼표로 구분)", placeholder="123,456,789", required=True)

        async def on_submit(self, interaction: discord.Interaction):
            await interaction.response.send_message(
                f"✅ 요청되었습니다!\n이슈번호: {self.issue_number.value}\n사유: {self.reason.value}\n선택된 멤버: {self.members.value}",
                ephemeral=True
            )

    await interaction.response.send_modal(RequestModal())

bot.run(TOKEN)
