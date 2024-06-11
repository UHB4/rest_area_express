const express = require('express')
const dotenv = require('dotenv')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const oracledb = require('oracledb');
const {
    login,
    accessToken,
    refreshToken,
    loginSuccess,
    logout
} = require('./controller')
const app = express();
dotenv.config();



oracledb.initOracleClient({ libDir: 'C:\\instantclient_21_13' });

//  기본설정을 해줍니다.

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin : 'http://localhost:3000',
    methods : ['GET','POST'],
    credentials : true,

}))

app.post('/login',login)
app.get('/accesstoken',accessToken)
app.get('/refreshtoken',refreshToken)
app.get('/login/success', loginSuccess);
app.get('/logout',logout)









async function fetchAllChargerData(zcode, serviceKey) {
    let allItems = [];  // 불러온 데이터를 저장할 배열
    let pageNo = 1;     // API에서 데이터를 가져올 페이지 번호
    let hasMore = true; // 더 불러올 데이터가 있는지 확인하는 변수

    // 더 이상 데이터가 없을 때까지 반복하여 데이터를 요청함
    while (hasMore) {
        const response = await axios.get(`https://apis.data.go.kr/B552584/EvCharger/getChargerStatus`, {
            params: {
                serviceKey: decodeURIComponent(serviceKey), // API 사용 키, URL 인코딩 해제
                pageNo: pageNo,                             // 요청할 페이지 번호
                numOfRows: 1000,                            // 한 페이지에 요청할 데이터 수
                period: 10,                                 // 데이터 조회 기간
                zcode: zcode                                // 지역 코드
            }
        }).catch(error => {
            console.error(`zcode ${zcode}에 대한 데이터 조회 오류:`, error);
            return { data: { items: [] } }; // 에러 발생 시 빈 배열 반환
        });

        // 응답에서 데이터 항목만 추출하여 allItems 배열에 추가
        const items = response.data.items && response.data.items[0] ? response.data.items[0].item : [];
        allItems = allItems.concat(items);
        pageNo++;                         // 다음 페이지로 번호 증가
        hasMore = items.length > 0;       // 가져온 데이터가 없으면 반복 중지
    }

    return allItems; // 모든 데이터를 반환
}

// '/find-stations' 경로로 POST 요청이 오면 처리하는 라우트 핸들러
app.post('/find-stations', async (req, res) => {
    console.log('요청 받음:', req.body);

    const { latitude, longitude } = req.body;
    const lat = parseFloat(latitude);  // 문자열 형태의 위도를 숫자로 변환
    const lng = parseFloat(longitude); // 문자열 형태의 경도를 숫자로 변환

    // 변환된 위도 또는 경도가 숫자가 아니면 오류 메시지를 클라이언트에 보냄
    if (isNaN(lat) || isNaN(lng)) {
        console.error('잘못된 위도 또는 경도:', latitude, longitude);
        return res.status(400).json({ error: '잘못된 위도 또는 경도 값' });
    }

    try {
        console.log('데이터베이스 연결 중...');
        const connection = await oracledb.getConnection(dbConfig); // 데이터베이스 연결 수립
        const sqlQuery = `
            SELECT *
            FROM (SELECT statNm, statId, addr, lat, lng, zcode, distance
                  FROM (SELECT statNm,
                               statId,
                               addr,
                               lat,
                               lng,
                               zcode,
                               (6371 * acos(cos(:inputLatitude * (acos(-1) / 180)) * cos(lat * (acos(-1) / 180)) *
                                            cos((lng - :inputLongitude) * (acos(-1) / 180)) +
                                            sin(:inputLatitude * (acos(-1) / 180)) * sin(lat * (acos(-1) / 180)))) AS distance
                        FROM chargingstations
                        WHERE lat BETWEEN :minLat AND :maxLat
                          AND lng BETWEEN :minLng AND :maxLng)
                  WHERE distance < :inputRadius)
            WHERE ROWNUM <= 10000
        `;
        const bindVars = {
            inputLatitude: lat,              // 사용자의 위도
            inputLongitude: lng,             // 사용자의 경도
            inputRadius: req.body.radius / 1000, // 검색 반경, km 단위로 변환
            minLat: lat - 0.1,               // 최소 위도 계산
            maxLat: lat + 0.1,               // 최대 위도 계산
            minLng: lng - 0.1,               // 최소 경도 계산
            maxLng: lng + 0.1,               // 최대 경도 계산
        };

        const dbResult = await connection.execute(sqlQuery, bindVars); // 쿼리 실행
        console.log('데이터베이스 쿼리 성공, 데이터:', dbResult.rows);

        // 결과 데이터를 새로운 형태로 매핑
        const dbData = dbResult.rows.map(([statNm, statId, addr, lat, lng, zcode, distance]) => ({
            statNm,
            statId,
            addr,
            lat,
            lng,
            zcode,
            distance
        }));

        console.log('외부 API에서 충전소 데이터 가져오는 중...');
        // 충전소 데이터를 외부 API에서 가져옴
        const allChargerData = await fetchAllChargerData(dbData[0].zcode, 'IlZ7RtUxbjbhLasNibsu0BLs3Yn5mA2szeYP%2FnWPZbhdOAEGuD9NXzjKJjPvQLYPZ8D%2FsN8oqImmuuvmosCrGw%3D%3D');

        console.log('매칭되는 충전소 데이터 필터링 중...');
        // 데이터베이스에서 가져온 충전소 정보와 API에서 가져온 충전소 상태 정보를 매칭
        const matchingChargerData = allChargerData.filter(charger => dbData.some(dbItem => dbItem.statId === charger.statId)).map(charger => ({
            ...dbData.find(dbItem => dbItem.statId === charger.statId),
            stat: charger.stat,
            statUpdDt: charger.statUpdDt,
            lastTsdt: charger.lastTsdt,
            lastTedt: charger.lastTedt,
            chgerId: charger.chgerId
        }));

        console.log('클라이언트에 응답 반환 중...');
        res.json({ matchingChargerData }); // 매칭된 데이터를 클라이언트에 응답으로 보냄

        await connection.close(); // 데이터베이스 연결 종료
    } catch (err) {
        console.error('데이터베이스 쿼리 오류:', err);
        res.status (500).send('데이터베이스 쿼리 중 오류 발생'); // 에러 발생 시 클라이언트에 500 상태 코드와 메시지 전송
    }
});

app.listen(process.env.PORT, ()=>{
    console.log(`server is on ${process.env.PORT}`);
})

