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

const createEmbedsFromIssues = (issues) => {
  return issues.map((issue) => {
    const repo = issue.repo_fullname || '';
    const issueNumber = issue.issue_number || '';
    const issueUrl = `https://github.com/${repo}/issues/${issueNumber}`;

    return {
      title: `📝 ${issue.title || '제목 없음'}`,
      url: issueUrl,  // 👉 타이틀에 링크 연결
      description: issue.body || '설명 없음',
      fields: [
        {
          name: '📦 Repository',
          value: repo || '없음',
          inline: false
        },
        {
          name: '📅 Iteration (Sprint)',
          value: `S${issue.iteration ?? '없음'}`,
          inline: true
        },
        {
          name: '🏷️ Labels',
          value: issue.labels?.join(', ') || '없음',
          inline: true
        },
        {
          name: '👥 Assignees',
          value: issue.assignees?.map(a => a.name || a.github_name).join(', ') || '없음',
          inline: false
        }
      ],
      footer: {
        text: `이슈 번호: #${issueNumber || '없음'}`
      }
    };
  });
};

const sendIssueEmbedsInChunks = async (issues, dmChannel) => {
  if (!issues?.length) {
    await DiscordRequest(`/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      body: {
        content: '✅ 현재 할당된 이슈가 없습니다.'
      }
    });
    return;
  }

  const embeds = createEmbedsFromIssues(issues);

  const chunks = embeds.reduce((acc, embed, i) => {
    const chunkIndex = Math.floor(i / 10);
    acc[chunkIndex] = acc[chunkIndex] || [];
    acc[chunkIndex].push(embed);
    return acc;
  }, []);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const content =
      chunks.length > 1
        ? `📦 할당된 이슈 목록입니다 (${i + 1}/${chunks.length})`
        : '📦 할당된 이슈 목록입니다';

    await DiscordRequest(`/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      body: {
        content,
        embeds: chunk
      }
    });
  }
};

export async function sendDailyIssueDM(discord_id, issues) {
  console.log('📦 DM 전송 시작 - 받은 issues:', issues);
  if (!issues || !discord_id) {
    console.error('❗ DM 전송 실패 - 필요한 값이 없음', { issues, discord_id });
    return;
  }

  try {
    // 1. DM 채널 생성
    const dmRes = await DiscordRequest(`/users/@me/channels`, {
      method: 'POST',
      body: { recipient_id: discord_id },
    });
    const dmChannel = await dmRes.json();

    // 2. 이슈 목록 전송
    await sendIssueEmbedsInChunks(issues, dmChannel);
  } catch (err) {
    console.error('❗ Discord DM 전송 실패:', err);
  }
}
