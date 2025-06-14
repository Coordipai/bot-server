import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALERM_COMMAND = {
  name: 'alerm',
  description: 'alerm 명령어',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const REQUEST_COMMAND = {
  name: 'request',
  description: 'request 명령어',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ISSUE_COMMAND = {
  name: 'issue',
  description: '배정된 이슈를 DM으로 받습니다.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, ALERM_COMMAND, REQUEST_COMMAND, ISSUE_COMMAND];


InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
