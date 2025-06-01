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

# 6. 환경변수가 필요할 수 있으므로 dotenv를 이용한 실행 준비
# 기본 실행 명령어
CMD ["npm", "start"]
