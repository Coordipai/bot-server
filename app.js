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

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
