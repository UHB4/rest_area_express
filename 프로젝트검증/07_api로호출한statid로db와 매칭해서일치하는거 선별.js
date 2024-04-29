const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
const axios = require('axios');

oracledb.autoCommit = true;
oracledb.initOracleClient({libDir: 'D:\\instantclient_21_13'});

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    user: "restarea",
    password: "1577",
    connectString: "//localhost:1521/xe"
};

async function fetchAllChargerData(zcode, serviceKey) {
    let allItems = [];
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
        const response = await axios.get(`https://apis.data.go.kr/B552584/EvCharger/getChargerStatus`, {
            params: {
                serviceKey: decodeURIComponent(serviceKey),
                pageNo: pageNo,
                numOfRows: 10, // Adjust numOfRows as needed for efficiency
                period: 5,
                zcode: zcode
            }
        }).catch(error => {
            console.error(`Error fetching data for zcode ${zcode}:`, error);
            return { data: { items: { item: [] } } }; // Default empty response structure in case of error
        });

        const items = response.data.items ? response.data.items[0].item : [];
        allItems = allItems.concat(items);
        pageNo++;

        // Check if there are more pages to fetch
        hasMore = items.length > 0;
    }

    return allItems;
}

app.post('/find-stations', async (req, res) => {
    const {latitude, longitude} = req.body;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({error: 'Invalid latitude or longitude value'});
    }

    try {
        const connection = await oracledb.getConnection(dbConfig);
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
                                            sin(:inputLatitude * (acos(-1) / 180)) *
                                            sin(lat * (acos(-1) / 180)))) AS distance,
                               ROW_NUMBER()                                  OVER (PARTITION BY statNm, statId ORDER BY (6371 * acos(cos(:inputLatitude * (acos(-1)/180)) * cos(lat * (acos(-1)/180)) * cos((lng - :inputLongitude) * (acos(-1)/180)) + sin(:inputLatitude * (acos(-1)/180)) * sin(lat * (acos(-1)/180)))) ASC) AS rn
                        FROM chargingstations
                        WHERE lat BETWEEN :minLat AND :maxLat
                          AND lng BETWEEN :minLng AND :maxLng
                          AND (6371 * acos(cos(:inputLatitude * (acos(-1) / 180)) * cos(lat * (acos(-1) / 180)) *
                                           cos((lng - :inputLongitude) * (acos(-1) / 180)) +
                                           sin(:inputLatitude * (acos(-1) / 180)) * sin(lat * (acos(-1) / 180)))) < 1)
                  WHERE rn = 1)
            WHERE ROWNUM <= 50
        `;
        const bindVars = {
            inputLatitude: lat,
            inputLongitude: lng,
            minLat: lat - 0.1,
            maxLat: lat + 0.1,
            minLng: lng - 0.1,
            maxLng: lng + 0.1,
        };

        const dbResult = await connection.execute(sqlQuery, bindVars);
        const dbData = dbResult.rows.map(([statNm, statId, addr, lat, lng, zcode, distance]) => ({
            statNm,
            statId,
            addr,
            lat,
            lng,
            zcode,
            distance
        }));

        // Collect all charger data from API
        const allChargerData = await fetchAllChargerData(dbData[0].zcode, 'jTbpBj1wME8JzZ428x9kIZgxFeZdUPuml5bBxel5tl4psYsvBzflM7bNW5wJsmRIu5v3T6eheYbmckVmwBOi0w=='); // Assuming all dbData items have the same zcode for simplicity

        const matchingChargerData = allChargerData.filter(charger => {
            return charger && dbData.some(dbItem => dbItem.statId === charger.statId);
        });

        if (matchingChargerData.length > 0) {
            matchingChargerData.forEach(item => {
                console.log(`Matching Charger Data: ${JSON.stringify(item, null, 2)}`);
            });
        } else {
            console.log("No matching charger data found.");
        }

        res.json({dbData, matchingChargerData});

        await connection.close();
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).send('Error querying the database');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
