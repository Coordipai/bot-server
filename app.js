import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji } from './utils.js';
import { handleAlermCommand } from './commands/alerm.js';
import { handleRequestCommand } from './commands/request.js';
import { handleIssueCommand, sendDailyIssueDM } from './commands/issue.js';
import fetch from 'node-fetch';
import { calculateIteration } from './utils/iteration.js';

const baseUrl = process.env.API_BASE_URL;



// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello world ${getRandomEmoji()}`
            }
          ]
        },
      });
    }
    if (name === 'alerm') {
      // interaction 객체(req.body)를 handleAlermCommand에 전달
      return res.send(await handleAlermCommand(req.body));
    }
    if (name === 'request') {
      return res.send(await handleRequestCommand(req.body));
    }
    if (name === 'issue') {
      return res.send(await handleIssueCommand(req.body));
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  /**
   * Handle modal submit requests
   * See https://discord.com/developers/docs/interactions/message-components#modals
   */
  if (type === InteractionType.MODAL_SUBMIT && data.custom_id === 'project_request_modal') {

    // 3초 내에 임시 응답 (EPHEMERAL)
    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,

      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });

    // 이후 비동기로 모든 작업 처리
    (async () => {
      // 입력값 추출
      const fields = {};
      for (const row of data.components) {
        for (const comp of row.components) {
          fields[comp.custom_id] = comp.value;
        }
      }

      const guildId = req.body.guild_id;
      const userId = req.body.member?.user?.id || req.body.user?.id;

      const body = {
        issue_number: Number(fields.issue_number),
        reason: fields.reason,
        new_iteration: Number(fields.new_iteration),
        new_assignees: [fields.member_github_name]
      };

      // POST /bot 요청
      const apiRes = await fetch(`${process.env.API_BASE_URL}/bot/issue-reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'discord-channel-id': guildId,
          'discord-user-id': userId,
          'Discord-Bot': true
        },
        body: JSON.stringify(body)
      });
      console.log('body', body);
      const apiResult = await apiRes.json();
      console.log('API Result:', apiResult);

      // 1. 프로젝트 정보 다시 조회 (GET)
      const projectRes = await fetch(`${process.env.API_BASE_URL}/bot/project`, {
        headers: {
          'Content-Type': 'application/json',
          'discord-channel-id': guildId,
          'discord-user-id': userId,
          'Discord-Bot': true
        }
      });
      const projectData = await projectRes.json();
      const ownerDiscordId = projectData?.content?.data?.owner?.discord_id;
      const projectName = projectData?.content?.data?.name;
      console.log('Project Data:', projectData);

      // 2. DM 전송 (Discord API)
      if (ownerDiscordId && apiResult?.content?.data) {
        // DM 채널 생성
        const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${process.env.BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ recipient_id: ownerDiscordId })
        });
        const dmChannel = await dmChannelRes.json();
        console.log('DM Channel:', dmChannel); // 여기에 error, message 필드가 있는지 확인

        if (dmChannel.id) {
          await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bot ${process.env.BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              embeds: [
                {
                  title: '이슈 변경 요청 알림',
                  color: 0x5865F2, // Discord 블루
                  fields: [
                    { name: '프로젝트 명', value: projectName || '-', inline: false },
                    { name: '요청된 이슈 번호', value: String(apiResult?.content?.data.issue_number), inline: true },
                    { name: '사유', value: apiResult?.content?.data.reason || '-', inline: false },
                    { name: '추천한 사용자', value: (apiResult?.content?.data.new_assignees || []).join(', ') || '-', inline: true },
                    { name: '추천한 주기', value: String(apiResult?.content?.data.new_iteration), inline: true }
                  ],
                  timestamp: new Date().toISOString()
                }
              ]
            })
          });
        } else {
          console.error('DM 채널 생성 실패:', dmChannel);
        }
      }

      // follow-up 메시지로 최종 안내 (EPHEMERAL)
      await fetch(`https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${req.body.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '이슈변경요청 완료되었습니다..',
          flags: InteractionResponseFlags.EPHEMERAL
        })
      });
    })();

    return;
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.use(express.json());

app.post('/projectinfo', async (req, res) => {
  const projectList = req.body;
  // console.log('received : ', projectList);

  if (!Array.isArray(projectList)) {
    return res.status(400).json({ error: 'data must be an array' });
  }

  try {
    for (const { discord_channel_id, discord_id } of projectList) {
      // 1. 프로젝트 정보 가져오기 (필요한 경우)
      const projectRes = await fetch(`${baseUrl}/bot/project`, {
        headers: {
          'Content-Type': 'application/json',
          'discord-channel-id': discord_channel_id,
          'discord-user-id': discord_id,
          'Discord-Bot' : true
        }
      });      
      
      if (!projectRes.ok) {
        console.error(`❗ 프로젝트 정보 가져오기 실패: ${projectRes.status} ${projectRes.statusText}`);
        continue;
      }
      const project = await projectRes.json();

      // console.log('project: ', project);

      // 2. 이슈 목록 가져오기
      const issueRes = await fetch(`${baseUrl}/bot/issues`, {
        headers: {
          'Content-Type': 'application/json',
          'discord-channel-id': discord_channel_id,
          'discord-user-id': discord_id,
          'Discord-Bot' : true
        }
      });
      if (!issueRes.ok) {
        console.error(`❗ 이슈 목록 가져오기 실패: ${issueRes.status} ${issueRes.statusText}`);
        continue;
      }

      const issues = await issueRes.json();
      const issuesData = issues?.content?.data || [];

       // 3. 현재 iteration 계산
      const currentIteration = calculateIteration(project.content.data.start_date, project.content.data.sprint_unit);
    
      // 4. 현재 iteration + 해당 사용자에게 할당된 이슈 필터링
      let filteredIssues = [];

      for (const issue of issuesData) {
        if (issue.iteration == currentIteration.sprint) {
          console.log("issue: ", issue);
          console.log("issue assginees: ", issue.assignees);
          for (const assignee of issue.assignees) {
            if (assignee.discord_id === discord_id) {
              filteredIssues.push(issue);
            }
          }
        }
      }

      console.log("filtered issues: ", filteredIssues);

      // 4. DM 전송
      if (filteredIssues.length > 0) {
          console.log(`📤 ${discord_id}에게 이슈 ${filteredIssues.length}개 전송 준비`);
          await sendDailyIssueDM(discord_id, filteredIssues);
        }
      }

      res.status(200).json({ message: '이번 iteration의 이슈 DM 전송 완료' });
    } catch (err) {
      console.error('Error while processing project info:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
