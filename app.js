import 'dotenv/config';
import express from 'express';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import { handleAlermCommand } from './commands/alerm.js';
import { handleRequestCommand } from './commands/request.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

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
    const apiRes = await fetch(`${process.env.API_BASE_URL}/bot`, {
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

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
