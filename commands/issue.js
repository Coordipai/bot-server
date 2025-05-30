import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';

export async function handleIssueCommand(interaction) {
  const baseUrl = process.env.API_BASE_URL;
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  try {
    const response = await fetch(`${baseUrl}/bot`, {
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'discord-user-id': userId,
        'Discord-Bot': true,
      },
    });

    const result = await response.json();
    const issues = result?.content?.data;

    let message = '';

    if (Array.isArray(issues) && issues.length > 0) {
      message = issues
        .map(
          (issue) =>
            `#${issue.issue_number} [${issue.repo_fullname}]\n${issue.title}\n${issue.closed ? '✅ Closed' : '🟢 Open'}\n`
        )
        .join('\n');
    } else {
      message = '현재 배정된 이슈가 없습니다.';
    }

    // ✅ 비동기 구조 통일
    const dmRes = await DiscordRequest(`/users/@me/channels`, {
      method: 'POST',
      body: { recipient_id: userId },
    });
    const dmChannel = await dmRes.json();

    await DiscordRequest(`/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      body: { content: message },
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '📬 DM으로 이슈를 전송했습니다!',
      },
    };
  } catch (error) {
    console.error('❌ handleIssueCommand 에러:', error);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❗ 이슈 전송 중 오류가 발생했습니다.',
      },
    };
  }
}


const mockUserList = ['123456789012345678', '987654321098765432']; // 실제 userId들로 바꿔줘

export async function sendDailyIssueDM() {
  const baseUrl = process.env.API_BASE_URL;

  for (const userId of mockUserList) {
    try {
      // ✅ DM 채널 생성
      const dmRes = await DiscordRequest(`/users/@me/channels`, {
        method: 'POST',
        body: { recipient_id: userId },
      });

      const dmChannel = await dmRes.json();
      const dmChannelId = dmChannel.id;

      // ✅ /bot API 호출 (DM 채널 ID를 discord-channel-id로)
      const res = await fetch(`${baseUrl}/bot`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'discord-user-id': userId,
          'discord-channel-id': dmChannelId,
          'Discord-Bot': true
        },
      });

      const result = await res.json();
      const issues = result?.content?.data || [];

      // ✅ 유저에게 배정된 이슈만 필터링
      const assigned = issues.filter(issue =>
        issue.assignees?.some(assignee => assignee.discord_id === userId)
      );

      let message = '';

      if (assigned.length > 0) {
        message = assigned.map(issue =>
          `#${issue.issue_number} [${issue.repo_fullname}]\n${issue.title}\n담당자: ${issue.assignees.map(a => a.name).join(', ')}`
        ).join('\n\n');
      } else {
        message = '📭 현재 배정된 이슈가 없습니다.';
      }

      // ✅ DM 전송
      await DiscordRequest(`/channels/${dmChannelId}/messages`, {
        method: 'POST',
        body: { content: `🗓 오늘의 이슈 목록입니다:\n\n${message}` },
      });

      console.log(`✅ ${userId}에게 DM 전송 완료`);
    } catch (err) {
      console.error(`❌ ${userId}에게 DM 전송 실패:`, err.message);
    }
  }
}
