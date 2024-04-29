const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');

oracledb.autoCommit = true;
oracledb.initOracleClient({libDir: 'D:\\instantclient_21_13'});

const app = express();
app.use(cors());
app.use(express.json()); // bodyParser는 express에 내장되어 있습니다.

const dbConfig = {
    user: "restarea",
    password: "1577",
    connectString: "//localhost:1521/xe"
};

app.post('/find-stations', async (req, res) => {
    const {latitude, longitude} = req.body;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    console.log('Received data from client:', req.body); // 클라이언트로부터 받은 데이터 로깅
    console.log('Parsed Latitude:', lat); // 파싱된 위도
    console.log('Parsed Longitude:', lng); // 파싱된 경도

    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({error: 'Invalid latitude or longitude value'});
    }

    try {
        const connection = await oracledb.getConnection(dbConfig);

        const sqlQuery = `
            SELECT * FROM (
                              SELECT statNm, statId, addr, lat, lng, zcode,distance
                              FROM (
                                       SELECT statNm, statId, addr, lat, lng, zcode,
                                              (6371 * acos(cos(:inputLatitude * (acos(-1)/180)) * cos(lat * (acos(-1)/180)) * cos((lng - :inputLongitude) * (acos(-1)/180)) + sin(:inputLatitude * (acos(-1)/180)) * sin(lat * (acos(-1)/180)))) AS distance,
                                              ROW_NUMBER() OVER (PARTITION BY statNm, statId ORDER BY (6371 * acos(cos(:inputLatitude * (acos(-1)/180)) * cos(lat * (acos(-1)/180)) * cos((lng - :inputLongitude) * (acos(-1)/180)) + sin(:inputLatitude * (acos(-1)/180)) * sin(lat * (acos(-1)/180)))) ASC) AS rn
                                       FROM chargingstations
                                       WHERE lat BETWEEN :minLat AND :maxLat
                                         AND lng BETWEEN :minLng AND :maxLng
                                         AND (6371 * acos(cos(:inputLatitude * (acos(-1)/180)) * cos(lat * (acos(-1)/180)) * cos((lng - :inputLongitude) * (acos(-1)/180)) + sin(:inputLatitude * (acos(-1)/180)) * sin(lat * (acos(-1)/180)))) < 1
                                   )
                              WHERE rn = 1
                          )
            WHERE ROWNUM <= 10
        `;

        const range = 0.1; // 적절한 범위 설정
        const bindVars = {
            inputLatitude: lat,
            inputLongitude: lng,
            minLat: lat - range,
            maxLat: lat + range,
            minLng: lng - range,
            maxLng: lng + range,
        };

        const result = await connection.execute(sqlQuery, bindVars);
        const data = result.rows.map(([statNm, statId, addr, lat, lng, zcode, distance]) => ({
            statNm,
            statId,
            addr,
            lat,
            lng,
            zcode,
            distance
        }));

        // Extract unique zcodes from the data
        const zcodes = [...new Set(data.map(item => item.zcode))];
        console.log('Unique zcodes:', zcodes); // 중복 없는 zcode 리스트를 콘솔에 출력

        res.json({ data, zcodes }); // 데이터와 zcode 리스트를 클라이언트에 전송

        await connection.close();

    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).send('Error querying the database');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});
