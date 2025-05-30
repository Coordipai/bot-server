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

    // 디스코드 DM 전송
    await DiscordRequest(`/users/@me/channels`, {
      method: 'POST',
      body: { recipient_id: userId },
    }).then(async (dmRes) => {
      const dmChannel = await dmRes.json();
      await DiscordRequest(`/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        body: { content: message },
      });
    });

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'DM으로 이슈를 전송했습니다!',
      },
    };
  } catch (error) {
    console.error('DM 전송 실패:', error);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '이슈 전송 중 오류가 발생했습니다.',
      },
    };
  }
}
