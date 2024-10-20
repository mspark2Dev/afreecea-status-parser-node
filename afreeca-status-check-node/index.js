// index.js
const express = require('express');
const puppeteer = require('puppeteer');  // Puppeteer 모듈
const winston = require('winston');  // Winston 로깅 라이브러리 사용
const app = express();
const PORT = 3000;

// Winston 로거 설정
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),  // 콘솔에 출력
        new winston.transports.File({ filename: 'server.log' })  // 로그 파일 저장
    ]
});

// JSON 형식의 요청을 파싱하기 위해 미들웨어 추가
app.use(express.json());

// 방송 상태를 확인하는 함수 (동기)
async function getBroadcastStatus(target) {
    const baseBroadcastUrl = "https://play.sooplive.co.kr/";
    const broadcastUrl = `${baseBroadcastUrl}${target}`;

    if (!target) {
        logger.info("No target provided");
        return { status: "ERROR" };  // 즉시 결과 반환
    }

    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],  // 리눅스 호환성 옵션
        });

        const page = await browser.newPage();
        await page.goto(broadcastUrl, { waitUntil: 'networkidle2' });

        // 5초 대기
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5000ms = 5초 대기

        // 현재 URL 가져오기
        const currentUrl = page.url();
        
        // URL 상태 확인
        const status = currentUrl.endsWith('/null') ? 'OFF' : 'ON';
        console.log(`방송 상태: ${status}`);

        let metaInfo = {};
        if (status === 'ON') {
            metaInfo = await page.evaluate(() => {
                const metaTags = document.getElementsByTagName('meta');
                const ogTags = {};
                for (let meta of metaTags) {
                    const property = meta.getAttribute('property');
                    const content = meta.getAttribute('content');
                    // og:title, og:image, og:description만 필터링
                    if (property === 'og:title' || property === 'og:image' || property === 'og:description') {
                        ogTags[property] = content;
                    }
                }
                return ogTags;
            });
            console.log(`Meta 태그 정보:`, metaInfo);
            const title = metaInfo['og:title'];
            const description = metaInfo['og:description'].split("|");
            const thumbnail = metaInfo['og:image']

            return { status, user: description[1], category: description[0], title, thumbnail }
        } else {
            return { status: "OFF" };
        }
    } catch (e) {
        logger.error(`오류 발생: ${e}`);
        return { status: "OFF", detail: e.message };
    }
}

// /:target/check 엔드포인트 처리
app.get('/:target/check', (req, res) => {
    const target = req.params.target;
    logger.info(`status check : ${target}`);

    getBroadcastStatus(target)
        .then(result => res.json(result))
        .catch(e => res.status(500).json({ status: "OFF", detail: e.message }));
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`Server is running ${PORT}`);
});
