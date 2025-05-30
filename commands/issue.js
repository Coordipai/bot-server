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

  console.log('guildId:', guildId);
  console.log('userId:', userId);
  

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

    const projectId = projectData?.id;
    const startDate = projectData?.start_date;
    const sprintUnit = projectData?.sprint_unit;
    const { sprint: currentIteration } = calculateIteration(startDate, sprintUnit);


    console.log('📦 projectId:', projectId);
    console.log('📅 startDate:', startDate);
    console.log('📏 sprintUnit:', sprintUnit);
    console.log('🔢 currentIteration:', currentIteration);

    // 2. 전체 이슈 요청
    const response = await fetch(`${baseUrl}/bot`, {
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'discord-user-id': userId,
        'Discord-Bot': true,
      },
    });
    const result = await response.json();
    const issues = result?.content?.data || [];

    console.log('🐛 전체 이슈 목록:', JSON.stringify(issues, null, 2));

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



      console.log(`📝 이슈 #${issue.issue_number} | 스프린트 ${issueIteration} | 상태: ${issue.closed ? 'Closed' : 'Open'} | 포함됨? ${included ? '✅ Yes' : '❌ No'}`);

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


export async function sendDailyIssueDM() {
  const baseUrl = process.env.API_BASE_URL;

  try {
    // 💡 1. 먼저 project에서 전체 사용자와 iteration 가져오기
    const projectRes = await fetch(`${baseUrl}/bot/project`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'discord-bot': true
      },
    });
    const projectData = await projectRes.json();
    const currentIteration = projectData?.content?.data?.iteration;
    const users = projectData?.content?.data?.users || [];

    for (const user of users) {
      const userId = user.discord_id;

      // 2. DM 채널 생성
      const dmRes = await DiscordRequest(`/users/@me/channels`, {
        method: 'POST',
        body: { recipient_id: userId },
      });
      const dmChannel = await dmRes.json();
      const dmChannelId = dmChannel.id;

      // 3. 해당 유저의 이슈 요청
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

      // 4. 필터: 현재 스프린트 또는 지난 스프린트의 open 이슈
      const assigned = issues.filter(issue =>
        issue.assignees?.some(assignee =>
          assignee.discord_id === userId &&
          (
            assignee.iteration === currentIteration ||
            (assignee.iteration !== currentIteration && !issue.closed)
          )
        )
      );

      // 5. 메시지 구성
      const message = assigned.length > 0
        ? assigned.map(issue => {
            const assignee = issue.assignees.find(a => a.discord_id === userId);
            return `#${issue.issue_number} [${issue.repo_fullname}]\n${issue.title}\n🕒 ${issue.closed ? '✅ Closed' : '🟢 Open'}\n📆 ${assignee?.iteration ?? 'N/A'}`;
          }).join('\n\n')
        : '📭 현재 스프린트 혹은 초과된 이슈가 없습니다.';

      // 6. 전송
      await DiscordRequest(`/channels/${dmChannelId}/messages`, {
        method: 'POST',
        body: { content: `🗓 오늘의 이슈 목록입니다:\n\n${message}` },
      });

      console.log(`✅ ${userId}에게 DM 전송 완료`);
    }
  } catch (err) {
    console.error(`❌ 전체 DM 전송 실패:`, err.message);
  }
}
