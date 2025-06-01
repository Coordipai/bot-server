import { InteractionResponseType, InteractionResponseFlags, MessageComponentTypes } from 'discord-interactions';

export async function handleAlermCommand(interaction) {
  const baseUrl = process.env.API_BASE_URL;

  // guild_id와 user id 추출
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  if (!guildId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: '이 명령어는 서버(길드)에서만 사용할 수 있습니다.'
          }
        ]
      }
    };
  }

  try {
    const response = await fetch(`${baseUrl}/bot/issues`, {
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'discord-user-id': userId,
		'Discord-Bot': true
      },
    });
	const result = await response.json();
	// result 구조: { status_code, content: { message, data, ... }, ... }
	// 이슈 목록이 content.data에 배열로 들어있음
	let message = '';
	if (result?.content?.data && Array.isArray(result.content.data)) {
	  if (result.content.data.length === 0) {
		message = '이슈가 없습니다.';
	  } else {
		message = result.content.data
		  .map(
			(issue, idx) =>
			  `#${issue.issue_number} [${issue.repo_fullname}]\n${issue.title}\n${issue.closed ? '✅ Closed' : '🟢 Open'}\n`
		  )
		  .join('\n');
	  }
	} else {
	  message = result?.content?.message || '이슈 정보를 불러올 수 없습니다.';
	}
	const responseText = message;

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: responseText
          }
        ]
      }
    };
  } catch (error) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: `API 요청 실패: ${error.message}`
          }
        ]
      }
    };
  }
}