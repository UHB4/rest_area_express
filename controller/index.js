const dotenv = require('dotenv')
dotenv.config();
const oracledb = require('oracledb');
const dbConfig = {
    user: "jwuk",
    password:"1234",
    connectString:"192.168.0.32:1521/xe"
}

const jwt = require('jsonwebtoken');

const login = async (req, res, next) => {
    const { email, password } = req.body;

    let connection;

    try {
        // 데이터베이스 연결
        connection = await oracledb.getConnection(dbConfig);

        // SQL 쿼리 작성 및 실행
        const result = await connection.execute(
            `SELECT * FROM users WHERE email = :email AND password = :password`,
            [email, password]
        );

        // 결과 처리
        if (result.rows.length > 0) {
            // 사용자 정보가 일치하는 경우
            const userInfo = result.rows[0];
            //  access Token 발급
            const accessToken = jwt.sign({
                // id : userInfo.user_id,
                username : userInfo.username,
                email : userInfo.email
            },process.env.ACCESS_SERECT, {
                expiresIn: '1m',
                issuer : 'UHB',
            });
            // refresh Token 발급
            const refreshToken = jwt.sign({
                    // id : userInfo.user_id,
                    username : userInfo.username,
                    email : userInfo.email
                }, process.env.REFRESH_SECRET,{
                    expiresIn: '24h',
                    issuer : 'UHB'
                }
            )
            console.log(userInfo)

            // token 전송

            res.cookie("accessToken", accessToken,{
                secure: false,
                httpOnly : true,
            })

            res.cookie("refreshToken", refreshToken,{
                secure: false,
                httpOnly : true,
            })

            res.status(200).json("login success")

        } else {
            // 사용자 정보가 일치하지 않는 경우
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        // 연결 해제
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
};
const accessToken = (req, res)=>{

}

const refreshToken = (req, res) =>{

}

const loginSucess = (req, res)=>{


}

const logout = (req, res)=>{

}

module.exports= {
    login,
    accessToken,
    refreshToken,
    loginSucess,
    logout
}