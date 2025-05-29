import { InteractionResponseType, InteractionResponseFlags, MessageComponentTypes } from 'discord-interactions';

export function handleRequestCommand() {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content: 'request'
        }
      ]
    }
  };
}