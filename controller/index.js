const oracledb = require('oracledb');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const dbConfig = {
    user: "jwuk",
    password: "1234",
    connectString: "192.168.0.32:1521/xe"
};

const login = async (req, res, next) => {
    const { email, password } = req.body;
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `SELECT * FROM users WHERE email = :email AND password = :password`,
            [email, password]
        );

        if (result.rows.length > 0) {
            const userInfo = result.rows[0];
            const accessToken = jwt.sign({
                id: userInfo.USER_ID,
                username: userInfo.USERNAME,
                email: userInfo.EMAIL
            }, process.env.ACCESS_SECRET, {
                expiresIn: '1m',
                issuer: 'UHB',
            });

            const refreshToken = jwt.sign({
                id: userInfo.USER_ID,
                username: userInfo.USERNAME,
                email: userInfo.EMAIL
            }, process.env.REFRESH_SECRET, {
                expiresIn: '7d',
                issuer: 'UHB',
            });

            res.cookie("accessToken", accessToken, {
                secure: false,
                httpOnly: true,
            });

            res.cookie("refreshToken", refreshToken, {
                secure: false,
                httpOnly: true,
            });

            res.status(200).json("login success");
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
};

const accessToken = async (req, res) => {
    try {
        const token = req.cookies.accessToken;
        const data = jwt.verify(token, process.env.ACCESS_SECRET);

        let connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT * FROM users WHERE email = :email`,
            [data.email]
        );
        await connection.close();

        if (result.rows.length > 0) {
            const userData = result.rows[0];
            const { PASSWORD, ...others } = userData;
            res.status(200).json(others);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json(error);
    }
};

const refreshToken = async (req, res) => {
    try {
        const token = req.cookies.refreshToken;
        const data = jwt.verify(token, process.env.REFRESH_SECRET);

        let connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT * FROM users WHERE email = :email`,
            [data.email]
        );
        await connection.close();

        if (result.rows.length > 0) {
            const userData = result.rows[0];
            const accessToken = jwt.sign({
                id: userData.USER_ID,
                username: userData.USERNAME,
                email: userData.EMAIL
            }, process.env.ACCESS_SECRET, {
                expiresIn: '1m',
                issuer: 'UHB',
            });

            res.cookie("accessToken", accessToken, {
                secure: false,
                httpOnly: true,
            });

            res.status(200).json("Access Token Recreated");
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json(error);
    }
};

const loginSuccess = async (req, res) => {
    try {
        const token = req.cookies.accessToken;
        const data = jwt.verify(token, process.env.ACCESS_SECRET);

        let connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT * FROM users WHERE email = :email`,
            [data.email]
        );
        await connection.close();

        if (result.rows.length > 0) {
            const userData = result.rows[0];
            res.status(200).json(userData);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json(error);
    }
};

const logout = (req, res) => {
    try {
        res.cookie('accessToken', '', { maxAge: 0 });
        res.cookie('refreshToken', '', { maxAge: 0 });
        res.status(200).json("Logout Success");
    } catch (error) {
        res.status(500).json(error);
    }
};

module.exports = {
    login,
    accessToken,
    refreshToken,
    loginSuccess,
    logout
};
