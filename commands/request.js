import { InteractionResponseType, MessageComponentTypes } from 'discord-interactions';

// Discord 모달 컴포넌트 타입 직접 정의
const ModalComponentTypes = {
  ACTION_ROW: 1,
  TEXT_INPUT: 4,
};

export async function handleRequestCommand(interaction) {
  const baseUrl = process.env.API_BASE_URL;

  // guild_id와 user id 추출
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  if (!guildId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
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
    const response = await fetch(`${baseUrl}/bot/project`, {
      headers: {
        'Content-Type': 'application/json',
        'discord-channel-id': guildId,
        'discord-user-id': userId,
        'Discord-Bot': true
      },
    });
    const result = await response.json();

    // 반환값 구조에 맞게 정보 추출
    const data = result?.content?.data;

    // 프로젝트명
    const projectName = data?.name || '-';

    // 멤버 목록 "이름-깃허브이름" 형태로 가공
    const membersText = Array.isArray(data?.members)
      ? data.members.map(m => `${m.name || '-'} - ${m.github_name || '-'}`).join('\n') || '-'
      : '-';

    const issueNumber = data?.issue_number || '';
    const newIteration = data?.new_iteration || '';
    const memberGithubName = ''; // 새로 열릴 때는 빈 값

    return {
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: 'project_request_modal',
        title: `이슈 변경 요청서 - ${projectName}`,
        components: [
          // 1. 프로젝트명 (읽기 전용처럼, required: false, placeholder로 안내)
          
          // 2. 이슈 번호 입력
          {
            type: ModalComponentTypes.ACTION_ROW,
            components: [
              {
                type: ModalComponentTypes.TEXT_INPUT,
                custom_id: 'issue_number',
                style: 1,
                label: '이슈 번호',
                placeholder: '변경할 이슈 번호를 입력하세요',
                required: true,
                value: issueNumber // 항상 새로 받은 값
              }
            ]
          },
          // 3. 멤버 목록 (읽기 전용처럼, required: false, placeholder로 안내)
          {
            type: ModalComponentTypes.ACTION_ROW,
            components: [
              {
                type: ModalComponentTypes.TEXT_INPUT,
                custom_id: 'members_list',
                style: 2,
                label: '멤버 목록 (이름 - 깃허브이름)',
                value: membersText,
                required: false,
                placeholder: '수정 불가 (읽기 전용)',
              }
            ]
          },
          // 4. 멤버 입력 (깃허브 이름)
          {
            type: ModalComponentTypes.ACTION_ROW,
            components: [
              {
                type: ModalComponentTypes.TEXT_INPUT,
                custom_id: 'member_github_name',
                style: 1,
                label: '맴버(깃허브 이름) 입력',
                placeholder: 'ex)FriOct',
                required: true,
                value: memberGithubName // 항상 빈 값
              }
            ]
          },
		  // 5. 추천 주기 입력
		  {
			type: ModalComponentTypes.ACTION_ROW,
			components: [
			  {
				type: ModalComponentTypes.TEXT_INPUT,
				custom_id: 'new_iteration',
				style: 1,
				label: '추천 주기',
				placeholder: 'ex) 2',
				required: true,
				value: newIteration // 항상 새로 받은 값
			  }
			]
		  },
          // 5. 사유 입력
          {
            type: ModalComponentTypes.ACTION_ROW,
            components: [
              {
                type: ModalComponentTypes.TEXT_INPUT,
                custom_id: 'reason',
                style: 2, // Paragraph
                label: '사유',
                placeholder: '변경 요청 사유를 입력하세요',
                required: true,
              }
            ]
          }
        ]
      }
    };
  } catch (error) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
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

