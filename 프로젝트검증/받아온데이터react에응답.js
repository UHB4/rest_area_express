const express = require('express');
const app = express();
const oracledb = require("oracledb");
oracledb.autoCommit = true;
oracledb.initOracleClient({libDir: 'C:\\instantclient_21_13'});
const cors = require('cors'); // React 앱(클라이언트)가 localhost:3000에서 실행되고 있고, Express 앱(서버)가 localhost:5000에서 실행되고 있다면, 서버에서 명시적으로 클라이언트의 출처를 허용해야함.
// Oracle 연결 설정
const dbConfig = {
    user: "restarea",
    password: "1577",
    connectString: "//localhost:1521/xe"
};
app.use(cors());

// 포트 설정
app.set('port', process.env.PORT || 5000);

// 루트 경로 핸들러
app.get('/test-query', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        // 제공된 SQL 쿼리
        const sqlQuery = `
            SELECT * FROM (
                SELECT statNm, statId, addr, lat, lng, distance
                FROM (
                    SELECT statNm, statId, addr, lat, lng,
                           (6371 * acos(cos((37.500644)*(acos(-1)/180)) * cos(lat*(acos(-1)/180)) * cos((lng - 127.024529)*(acos(-1)/180)) + sin((37.500644)*(acos(-1)/180)) * sin(lat*(acos(-1)/180)))) AS distance,
                           ROW_NUMBER() OVER (PARTITION BY statNm, statId ORDER BY (6371 * acos(cos((37.500644)*(acos(-1)/180)) * cos(lat*(acos(-1)/180)) * cos((lng - 127.024529)*(acos(-1)/180)) + sin((37.500644)*(acos(-1)/180)) * sin(lat*(acos(-1)/180)))) ASC) AS rn
                    FROM chargingstations
                    WHERE lat BETWEEN 37.46 AND 37.54 AND lng BETWEEN 126.97 AND 127.08
                          AND (6371 * acos(cos((37.500644)*(acos(-1)/180)) * cos(lat*(acos(-1)/180)) * cos((lng - 127.024529)*(acos(-1)/180)) + sin((37.500644)*(acos(-1)/180)) * sin(lat*(acos(-1)/180)))) < 1
                )
                WHERE rn = 1
            )
            WHERE ROWNUM <= 50
        `;

        // 쿼리 실행
        const result = await connection.execute(sqlQuery);

        // 결과 로그 출력
        console.log(result.rows);

        // 클라이언트에 결과 전송
        res.json(result.rows);

        // 연결 종료
        await connection.close();

    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error executing query');
    }
});

// 서버 시작
app.listen(app.get('port'), () => {
    console.log(app.get('port'), '번 포트에서 대기 중');
    console.log('http://localhost:5000');
});
