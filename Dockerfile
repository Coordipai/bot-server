# 1. Node.js 18 베이스 이미지
FROM node:18

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 종속성 설치를 위한 package.json만 먼저 복사
COPY package*.json ./

# 4. 의존성 설치
RUN npm install

# 5. 나머지 소스 파일 전체 복사
COPY . .

# 6. 포트 설정
EXPOSE 3000

# 7. 명령어 등록 및 서버 시작 (shell 형식 사용)
SHELL ["/bin/sh", "-c"]
CMD npm run register && npm start
