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
    // 입력값 추출
    const fields = {};
    for (const row of data.components) {
      for (const comp of row.components) {
        fields[comp.custom_id] = comp.value;
      }
    }

    // 여기 수정!
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id || req.body.user?.id;

    // API 요청 바디 구성
    const body = {
      issue_number: Number(fields.issue_number), // 숫자
      reason: fields.reason,                    // 문자열
      new_iteration: Number(fields.new_iteration), // 숫자
      new_assignees: [fields.member_github_name]  // 문자열 배열
    };
    
    // POST /bot 요청
    const apiRes = await fetch(`${baseUrl}/bot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'Discord-Bot': true
      },
      body: JSON.stringify(body)
    });
    const apiResult = await apiRes.json();

    // 결과 메시지 반환
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: apiResult?.content?.message || '이슈 변경 요청이 완료되었습니다.'
        // components: [...] // 필요 없다면 빼세요
      }
    });
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
