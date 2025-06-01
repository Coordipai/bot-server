import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import { calculateIterationFromDate } from '../utils/iteration.js';
import { calculateIteration } from '../utils/iteration.js';


export async function handleIssueCommand(interaction) {
  const baseUrl = process.env.API_BASE_URL;

  // guild_id와 user id 추출
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id || interaction.user?.id;
  if (!guildId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❗ 이 명령어는 서버(길드) 안에서만 사용할 수 있습니다.',
      },
    };
}

  

  try {
    // 1. /bot/project에서 프로젝트 정보 받아오기
    const botProjectRes = await fetch(`${baseUrl}/bot/project`, {
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'discord-user-id': userId,
        'discord-bot': true,
      },
    });
    const botProjectData = await botProjectRes.json();
    const projectData = botProjectData?.content?.data;
    console.log('📦 projectData:', JSON.stringify(projectData, null, 2));


    const projectId = projectData?.id;
    const startDate = projectData?.start_date;
    const sprintUnit = projectData?.sprint_unit;
    const { sprint: currentIteration } = calculateIteration(startDate, sprintUnit);


    // 2. 전체 이슈 요청
    const response = await fetch(`${baseUrl}/bot/issues`, {
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'discord-user-id': userId,
        'Discord-Bot': true,
      },
    });
    const result = await response.json();
    const issues = result?.content?.data || [];


    // 3. 필터: 현재 스프린트 or 지난 스프린트 + 미완료
    const relevant = issues.filter(issue => {
      const assignee = issue.assignees?.find(a => String(a.discord_id) === String(userId));
      if (!assignee) return false;

      const issueIteration = issue.iteration;

      if (typeof issueIteration !== 'number') {
        console.warn(`⚠️ 이슈 #${issue.issue_number}에 iteration 정보가 없습니다.`);
        return false;
      }

      const included = issueIteration <= parseInt(currentIteration) && !issue.closed;




      return included;
    });


    // 4. 메시지 구성
    const message = relevant.length > 0
      ? relevant.map(issue => {
          return `#${issue.issue_number} [${issue.repo_fullname}]
          ${issue.title}
            🕒 ${issue.closed ? '✅ Closed' : '🟢 Open'}`;
        }).join('\n\n')
      : '📭 현재 스프린트 혹은 초과된 이슈가 없습니다.';

    // 5. DM 전송
    // ✅ 먼저 디스코드에 즉시 응답
    const ackResponse = {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    };
      
    // ✅ 이후 DM 전송은 비동기로 따로 수행
    setTimeout(async () => {
      try {
        const dmRes = await DiscordRequest(`/users/@me/channels`, {
          method: 'POST',
          body: { recipient_id: userId },
        });
        const dmChannel = await dmRes.json();

        await DiscordRequest(`/channels/${dmChannel.id}/messages`, {
          method: 'POST',
          body: { content: message },
        });

         await DiscordRequest(
          `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
          {
            method: 'PATCH',
            body: { content: '📬 DM으로 이슈를 전송했습니다!' },
          }
        );
      } catch (err) {
        console.error('❌ DM 전송 실패:', err);
      }
    }, 0);

    // ✅ 즉시 응답 반환
    return ackResponse;

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

export async function sendDailyIssueDM(discord_id, issue) {

  const content = `📝 **${issue.title}**
${issue.description || '설명 없음'}
🔗 링크: ${issue.url || '없음'}
📅 마감일: ${issue.due_date || '없음'}`;

  // DM 채널 생성
  const dmChannel = await DiscordRequest(`/users/@me/channels`, {
    method: 'POST',
    body: { recipient_id: discord_id }
  });

  // DM 메시지 전송
  await DiscordRequest(`/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    body: { content }
  });
}

