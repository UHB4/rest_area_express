const express = require('express');
const app = express();
const oracledb = require("oracledb");
oracledb.autoCommit = true;
oracledb.initOracleClient({libDir: 'C:\\instantclient_21_13'});
// Oracle 연결 설정
const dbConfig = {
    user: "restarea",
    password: "1577",
    connectString: "//localhost:1521/xe"
};

// 포트 설정
app.set('port', process.env.PORT || 5000);

// 루트 경로 핸들러
app.get('/', async (req, res) => {
    try {
        // Oracle 데이터베이스 연결
        const connection = await oracledb.getConnection(dbConfig);

        // 연결 확인 메시지 출력
        console.log('Oracle 데이터베이스에 연결되었습니다.');

        // 연결 종료
        await connection.close();

        // 결과 보내기
        res.send('Oracle 데이터베이스에 연결되었습니다.');
    } catch (err) {
        console.error('Oracle 데이터베이스 연결 오류:', err.message);
        res.status(500).send('Database connection error');
    }
});

// 서버 시작
app.listen(app.get('port'), () => {
    console.log(app.get('port'), '번 포트에서 대기 중');
    console.log('http://localhost:5000');
});
