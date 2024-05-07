const express = require('express');

//////////////////////////////////////////////////////////////////
const cors = require('cors');

////////////////////////////////////////////////////////////////////

const oracledb = require('oracledb');
const bodyParser = require('body-parser');
const session = require('express-session');
// 파일 처리를 위한 모듈
// 주의사항] 최신 버전의 multer는 한글 파일 처리가 되지 않는다. 아래와 같이 마이그레이션 하여 설치한다.

//npm uninstall multer
// npm install multer@1.4.4
const multer = require('multer');
// 파일 이동 기능을 위해 fs 모듈 필요
const fs = require('fs');
// multer에 최초 전송받을 임시 폴더의 경로를 지정하기 위해 path 모듈 사용
const path = require('path');
const axios = require("axios");
// Multer 설정
const upload = multer({ dest: path.join(__dirname, 'temp'), encoding: 'utf8' });
// 인코딩 코든느 없어도 될듯  다운그래이드 시킨걸로 된거같음
const app = express();



////////////////////// cors 관련 ///////////
// app.use(cors());
app.use(cors({
    origin: 'http://localhost:3000', // React 앱의 origin
    credentials: true, // 세션 쿠키를 전송하기 위해 필요
    methods: ['GET', 'POST', 'PUT', 'DELETE'] /// 추가 내용
}));

app.use(bodyParser.json());
//////////////////////////
const port = 3001;

// 한글이름의 파일명을 변환하기 위한 모듈
// const iconv = require('iconv-lite');

// CP949에서 UTF-8로 파일명 변환하는 함수
// function convertToUTF8(fileName) {
//     return iconv.decode(iconv.encode(fileName, 'CP949'), 'UTF-8');
// }

// app.set('view engine', 'ejs');
// // const WEB_SERVER_HOME = 'D:\\HKLee\\Util\\nginx-1.24.0\\html';
// const WEB_SERVER_HOME = 'C:\\JWLee\\util\\nginx window\\nginx-1.24.0\\html';
// // 업로드 폴더 정의
// const UPLOADS_FOLDER = path.join(WEB_SERVER_HOME, 'uploads');
// app.use('/', express.static(WEB_SERVER_HOME+ '/'));
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(session({
//     secret: 'secret-key',
//     resave: false,
//     saveUninitialized: true
// }));


// Oracle 데이터베이스 연결 설정
const dbConfig = {
    user: 'restarea',
    password: '1577',
    connectString: 'localhost:1521/xe'
    // user: 'restarea',
    // password: '1577',
    // connectString: '192.168.0.27:1521/xe'
};




app.set('view engine', 'ejs');
oracledb.initOracleClient({ libDir: 'C:\\instantclient_21_13' });


oracledb.autoCommit = true;

// express-session 미들웨어 설정
app.use(session({
    secret: 'mySecretKey', // 세션을 암호화하기 위한 임의의 키
    resave: false,
    // saveUninitialized: true,
    saveUninitialized: false, // 초기화되지 않은 세션을 저장소에 저장
    cookie: {
        httpOnly: true,   // 클라이언트 JavaScript가 쿠키를 볼 수 없도록 함
        secure: false,    // HTTPS를 사용하지 않는 경우 false, 사용하는 경우 true
        maxAge: 1000 * 60 * 60 * 24 // 쿠키 유효기간 (예: 24시간)
    }

}));
// 게시판 메인 페이지 렌더링
app.get('/boardMain', async (req, res) => {

    let conn;
    const loggedInUserId = req.session.loggedInUserId;
    const loggedInUserName = req.session.loggedInUserName;
    const loggedInUserRealName = req.session.loggedInUserRealName;

    try {
        conn = await oracledb.getConnection(dbConfig);
        let result = await conn.execute(
            `SELECT COUNT(*) AS total FROM posts`
        );
        const totalPosts = result.rows[0];
        const postsPerPage = 10; // 한 페이지에 표시할 게시글 수
        const totalPages = Math.ceil(totalPosts / postsPerPage); // 총 페이지 수 계산

        let currentPage = req.query.page ? parseInt(req.query.page) : 1; // 현재 페이지 번호



        const startRow = (currentPage - 1) * postsPerPage + 1;
        const endRow = currentPage * postsPerPage;

        // 정렬 방식에 따른 SQL 쿼리 작성
        let orderByClause = 'ORDER BY p.created_at DESC'; // 기본적으로 최신순 정렬

        if (req.query.sort === 'views_desc') {
            orderByClause = 'ORDER BY p.views DESC, p.created_at DESC'; // 조회수 내림차순, 최신순
        }

        // 검색 조건에 따른 SQL 쿼리 작성
        let searchCondition = ''; // 기본적으로 검색 조건 없음

        if (req.query.searchType && req.query.searchInput) {
            const searchType = req.query.searchType;
            const searchInput = req.query.searchInput;

            // 검색 조건에 따라 WHERE 절 설정
            if (searchType === 'title') {
                searchCondition = ` AND p.title LIKE '%${searchInput}%'`;
                // searchCondition = `p.title LIKE '%${searchInput}%'`;
            } else if (searchType === 'content') {
                searchCondition = ` AND p.content LIKE '%${searchInput}%'`;
                // searchCondition = `p.content LIKE '%${searchInput}%'`;
            } else if (searchType === 'author') {
                searchCondition = ` AND u.username LIKE '%${searchInput}%'`;
                // searchCondition = `u.username LIKE '%${searchInput}%'`;
            }
        }
// if() 다음 블록에 들어가는 조건: true, truesy (false가 아닌 모든값)
// if() 다음 블록이 수행되지 않는 조건: false, falsy(0, null, NaN)
        const sql_query = `SELECT
                 id,title,author,to_char(created_at,'YYYY-MM-DD'),views, likes,
                 (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments_count
             FROM (
                      SELECT
                          p.id, p.title, u.username AS author, p.created_at, p.views, p.likes,
                          ROW_NUMBER() OVER (${orderByClause}) AS rn
                      FROM posts p
                               JOIN users u ON p.author_id = u.id
                      WHERE 1=1 
                          ${searchCondition} 
                  ) p
             WHERE rn BETWEEN :startRow AND :endRow
            `;
        result = await conn.execute(sql_query,
            {
                startRow: startRow,
                endRow: endRow
            }
        );

        const MAX_PAGE_LIMIT = 5;
        const startPage = (totalPages - currentPage) < MAX_PAGE_LIMIT ? totalPages - MAX_PAGE_LIMIT + 1 : currentPage;
        const endPage = Math.min(startPage + MAX_PAGE_LIMIT - 1, totalPages);

        // res.render('index', {
        //     userId: loggedInUserId,
        //     userName: loggedInUserName,
        //     userRealName: loggedInUserRealName,
        //     posts: result.rows,
        //     startPage: startPage,
        //     currentPage: currentPage,
        //     endPage: endPage,
        //     totalPages: totalPages,
        //     maxPageNumber: MAX_PAGE_LIMIT
        // });
        res.json({
            userId: loggedInUserId,
            userName: loggedInUserName,
            userRealName: loggedInUserRealName,
            posts: result.rows,
            startPage: startPage,
            currentPage: currentPage,
            endPage: endPage,
            totalPages: totalPages,
            maxPageNumber: MAX_PAGE_LIMIT
        });


    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// 댓글 페이지 렌더링
// app.get('/addComment', (req, res) => {
//     const postId = req.query.post_id; // postId 가져오기
//     const userId = req.session.loggedInUserId;
//     const username = req.session.loggedInUserName;
//     const userRealName = req.session.loggedInUserRealName;
//     res.render('addComment',{postId: postId, userId:userId, userName:username, userRealName:userRealName});
// });
// app.post('/addComment', async (req, res) => {
//     // 로그인 여부 확인
//     if (!req.session.loggedIn) {
//         return res.redirect('/login'); // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
//     }
//
//     const post_id  = req.body.post_id;
//     const author_id = req.session.loggedInUserId;
//     const comment_id = req.body.comment_id; // req.body에서 comment_id를 가져옴
//     const { content } = req.body;
//
//     let conn;
//     try {
//         conn = await oracledb.getConnection(dbConfig);
//
//         // 댓글 추가
//         await conn.execute(
//             `INSERT INTO comments (id, post_id, author_id, content, parent_comment_id)
//              VALUES (comment_id_seq.nextval, :post_id, :author_id, :content, :parent_id)`, // parend_id를 parent_id로 수정
//             [post_id, author_id, content, comment_id]
//         );
//
//         await conn.commit();
//
//         res.redirect(`/detailPost/${post_id}`);
//     } catch (err) {
//         console.error(err);
//         res.status(500).send('Internal Server Error');
//     } finally {
//         if (conn) {
//             try {
//                 await conn.close();
//             } catch (err) {
//                 console.error(err);
//             }
//         }
//     }
// });

// 로그인 페이지 렌더링
app.get('/login', (req, res) => {

    // '/' 경로로의 요청은 Nginx에서 login.html을 처리하도록 리다이렉트
    res.redirect('/login.html');
});

// 로그인 처리
app.post('/login1111', bodyParser.urlencoded({ extended: false }), async (req, res) => {
    const { username, password } = req.body;
    console.log(req.body)
    console.log(`유저이름 : ${username} 비밀번호 : ${password}`)
    const authenticatedUser = await varifyID(username, password);


    if (authenticatedUser) {
        req.session.loggedIn = true;
        req.session.loggedInUserId = authenticatedUser.id; // 사용자 테이블의 ID (PK) 저장
        req.session.loggedInUserName = username;           // 사용자 테이블의 username
        req.session.loggedInUserRealName = authenticatedUser.name; // 사용자 테이블에서 실제 이름 저장

        console.log('post로받은 로긴한 사람이름'+req.session.loggedInUserRealName);

        // res.redirect(`/boardMain?id=${authenticatedUser.id}&username=${authenticatedUser.username}&name=${authenticatedUser.name}`);
        // res.redirect(`/boardMain`);
        // res.redirect('welcome', { WEB_SERVER_HOME, username });
        //전에는 이렇게 리다이렉트로 페이지를 보냄



        // res.json({isLoginSucceed:true})
        //원빈님의 방식으로 데이터 보내는것  이런식으로 트루로 보낼수있다. 방법 숙지

        res.json({
            loggedIn:req.session.loggedIn,
            loginId:req.session.loggedInUserId,
            userName:req.session.loggedInUserName,
            userRealName:req.session.loggedInUserRealName
        })
        //정승이 방법으로 데이터를 보내는것 위에서 true미리  만들어 놨기 때문!!


    } else {
        res.json({isLoginSucceed:false})
        // res.render('loginFail',{ username});
    }
});

/////////////////////////////////////////////////

/////////////////////////////////////////////////

app.get('/loginFail', (req, res) => {
    res.render('/loginFail');
});
// 로그아웃 처리
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('세션 삭제 중 오류 발생:', err);
            res.status(500).send('Internal Server Error');
        } else {
            res.redirect('/login'); // 로그아웃 후 로그인 페이지로 리다이렉트
        }
    });
});
async function varifyID(username, password) {
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            'SELECT * FROM users WHERE username = :username AND password = :password',
            { username, password }
        );

        if (result.rows.length > 0) {
            return {
                id: result.rows[0][0],
                username: result.rows[0][1],
                name: result.rows[0][3]
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error('오류 발생:', error);
        return null;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}




//
// 세션 정보를 반환하는 라우트
app.get('/session', (req, res) => {
    console.log("세션 데이터: ", req.session); // 세션 전체 내용을 로그로 확인
    if (req.session.loggedIn) {
        // 로그인 상태일 때 사용자 정보 반환
        res.json({
            loggedIn: true,
            // userId: req.session.userId,
            username: req.session.loggedInUserName,
            userRealName: req.session.loggedInUserRealName,
            userId : req.session.loggedInUserId

        });
    } else {
        // 로그인 상태가 아닐 때
        res.json({
            loggedIn: false
        });
    }
});
////////////////////////////////////////////////////








// 글 작성 페이지 렌더링
app.get('/create', (req, res) => {
    // 로그인 여부 확인 로직 작성
    res.render('create', {
        userId: req.session.userId,
        username: req.session.username,
        userRealName: req.session.userRealName
    });
});

// 게시글 작성 처리
// upload.array('files', 5)의 두번째 인자의 의미: 라우팅 핸들러 함수에 전달되는 미들웨어.
// 이것은 post 요청을 처리하는 함수 처리 전에 실행되어야 하는 작업을 정의
// 'files'는 폼(form)에서 파일 업로드 필드의 이름을 나타내며, 5는 최대 파일 개수를 의미
app.post('/create',async (req, res) => {
    // input의 이름이 files 임  나중에 ejs에서 확인
    console.log('Debug: post create');
    const { title, content } = req.body;
    console.log('body안에 들어간데이터:',req.body)
    /*
    - req.files: 이것은 Multer라는 미들웨어에 의해 추가.
    Multer는 파일 업로드를 처리하기 위한 미들웨어로,
    업로드된 파일에 대한 정보를 req.files 객체에 저장
    - files: req.files의 file객체들의 정보중
     */
    // const files = req.files.map(file => {
    //     return {
    //         // Multer의 file객체가 관리하는 업로드된 파일의 원본 이름
    //         originalName: file.originalname,
    //         // Multer의 file객체가 관리하는 업로드된 파일의 변환된 이름
    //         storedName: file.filename
    //     };
    // });


    const authorId = req.session.loggedInUserId; // 현재 로그인한 사용자의 ID
    console.log(":::::::::session check:::",req.session.loggedInUserId)
    let conn;
    try {
        conn = await oracledb.getConnection(dbConfig);

        // 게시글을 위한 시퀀스에서 새로운 ID 가져오기
        const result = await conn.execute(
            `SELECT post_id_seq.NEXTVAL FROM DUAL`
        );
        const postId = result.rows[0][0];

        // 게시글 삽입
        await conn.execute(
            `INSERT INTO posts (id, author_id, title, content, file_original_name, file_stored_name) VALUES (:id, :authorId, :title, :content, :file_original_name, :file_stored_name)`,
            {
                id: postId,
                authorId: authorId,
                title: title,
                content: content,
                // file_original_name: files.map(file => file.originalName).join(';'), // 파일의 원본 이름을 세미콜론으로 구분하여 저장
                file_original_name: '1', // 파일의 원본 이름을 세미콜론으로 구분하여 저장
                // file_stored_name: files.map(file => file.storedName).join(';') // 파일의 변환된 이름을 세미콜론으로 구분하여 저장
                file_stored_name:  '1'// 파일의 변환된 이름을 세미콜론으로 구분하여 저장
            }
        );

        // 변경 사항 커밋
        await conn.commit();

        res.json({
            userId: req.session.userId,
            username: req.session.username,
            userRealName: req.session.userRealName

        });


        // 파일 이동 및 임시 폴더의 파일 삭제
        // for (개별 요소 of 전체요소) : 전체 요소를 순회할 때 향상된 for문
        // for (const file of req.files) {
        //     // multer에서 관리하는 file 객체의 path속성은 시스템에서 지정하는 TEMP 환경변수에 지정된 경로를
        //     // 디폴트 값으로 임시저장 폴더를 지정한다.
        //     // 임시폴더와 타겟폴더를 지정하는 이유는 업로드한 파일의 위험성을 temp 디렉토리에서 검증하기 위한
        //     // 일반적인 절차이다.
        //     // 추가적으로 보안조치를 취할 경우 아래  fs.renameSync 메소드를 통해 최종 이동하기 전에 필요로직을 구현한다.
        //     const tempFilePath = file.path;
        //     const targetFilePath = path.join(UPLOADS_FOLDER, file.filename);
        //
        //     // 임시폴더의 파일을 타겟 경로로 이동
        //     fs.renameSync(tempFilePath, targetFilePath);
        // }
        //
        // // 게시글 작성 후 게시판 메인 페이지로 리다이렉트
        // res.redirect('/boardMain');
    } catch (err) {
        console.error('글 작성 중 오류 발생:', err);
        res.status(500).send('글 작성 중 오류가 발생했습니다.');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error('오라클 연결 종료 중 오류 발생:', err);
            }
        }
    }
});

app.get('/detailPost/:id', async (req, res) => {

    // 로그인 여부 확인
    // if (!req.session.loggedIn) {
    //     return res.redirect('/login'); // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
    // }



    console.log(":::::::::session check:::",req.session.loggedInUserId)
    const postId = req.params.id;
    const userId = req.session.loggedInUserId;
    const userName = req.session.loggedInUserName;
    const userRealName = req.session.loggedInUserRealName;
    console.log(`username: ${userName}`);
    let conn;
    try {
        conn = await oracledb.getConnection(dbConfig);



        // 조회수 증가 처리
        await conn.execute(
            `UPDATE posts SET views = views + 1 WHERE id = :id`,
            [postId]
        );

        // 변경 사항을 커밋
        await conn.commit();

        // 게시글 정보 가져오기
        const postResult = await conn.execute(
            `SELECT p.id, p.title, u.username AS author, p.content, TO_CHAR(p.created_at, 'YYYY-MM-DD') AS created_at,
                    p.views, p.likes, p.file_original_name, p.file_stored_name
             FROM posts p
                      JOIN users u ON p.author_id = u.id
             WHERE p.id = :id`,
            [postId],
            { fetchInfo: { CONTENT: { type: oracledb.STRING } } }
        );

        // 댓글 가져오기
        const commentResult = await conn.execute(
            `SELECT c.id, c.author_id, c.content, u.username AS author, TO_CHAR(c.created_at, 'YYYY-MM-DD HH:MM') AS created_at, c.parent_comment_id 
            FROM comments c
            JOIN users u ON c.author_id = u.id
            WHERE c.post_id = :id
            ORDER BY c.id`,
            [postId],
            { fetchInfo: { CONTENT: { type: oracledb.STRING } } }
        );


        // 댓글과 댓글의 댓글을 구성
        const comments = [];
        const commentMap = new Map(); // 댓글의 id를 key로 하여 댓글을 맵으로 저장

        commentResult.rows.forEach(row => {
            const comment = {
                id: row[0],
                author_id: row[1],
                content: row[2],
                author: row[3],
                created_at: row[4],
                children: [], // 자식 댓글을 저장할 배열
            };

            const parentId = row[5]; // 부모 댓글의 id

            if (parentId === null) {
                // 부모 댓글이 null이면 바로 댓글 배열에 추가
                comments.push(comment);
                commentMap.set(comment.id, comment); // 맵에 추가
            } else {
                // 부모 댓글이 있는 경우 부모 댓글을 찾아서 자식 댓글 배열에 추가
                const parentComment = commentMap.get(parentId);
                parentComment.children.push(comment);
            }
        });
        const post = {
            id: postResult.rows[0][0],
            title: postResult.rows[0][1],
            author: postResult.rows[0][2],
            content: postResult.rows[0][3],
            created_at: postResult.rows[0][4],
            views: postResult.rows[0][5],
            likes: postResult.rows[0][6],
            file_original_name: postResult.rows[0][7],
            file_stored_name: postResult.rows[0][8]
        };
        // res.render('detailPost', {
        //     post: post,
        //     userId: userId,
        //     username: userName,
        //     userRealName: userRealName,
        //     comments: comments
        res.json({
            post: post,
            userId: userId,
            username: userName,
            userRealName: userRealName,
            comments: comments





        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// 수정 페이지 렌더링
app.get('/editPost/:id', async (req, res) => {
    // 로그인 여부 확인
    if (!req.session.loggedIn) {
        return res.redirect('/login'); // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
    }

    const postId = req.params.id;
    const userId = req.params.user_id;
    const userName = req.query.username;
    const userRealName = req.query.user_realname;
    let conn;
    try {
        conn = await oracledb.getConnection(dbConfig);

        // 게시글 정보 가져오기
        const result = await conn.execute(
            `SELECT * FROM posts WHERE id = :id`,
            [postId],
            { fetchInfo: { CONTENT: { type: oracledb.STRING } } }
        );

        const post = {
            id: result.rows[0][0],
            title: result.rows[0][2],
            content: result.rows[0][3]
        };

        res.render('editPost', {
            post: post,
            userId: userId,
            username: userName,
            userRealName: userRealName
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// 수정 처리
app.post('/editPost/:id', async (req, res) => {
    const { title, content } = req.body;
    const postId = req.params.id;

    let conn;
    try {
        conn = await oracledb.getConnection(dbConfig);

        // 게시글 수정
        await conn.execute(
            `UPDATE posts SET title = :title, content = :content WHERE id = :id`,
            [title, content, postId]
        );

        // 변경 사항 커밋
        await conn.commit();

        // 수정 후 상세 페이지로 리다이렉트
        res.redirect(`/detailPost/${postId}?user_id=${req.session.userId}&username=${req.session.username}&user_realname=${req.session.userRealName}`);
    } catch (err) {
        console.error('게시글 수정 중 오류 발생:', err);
        res.status(500).send('게시글 수정 중 오류가 발생했습니다.');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error('오라클 연결 종료 중 오류 발생:', err);
            }
        }
    }
});
// 삭제 처리
app.get('/deletePost/:id', async (req, res) => {
    // 로그인 여부 확인
    if (!req.session.loggedIn) {
        return res.redirect('/login'); // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
    }

    const postId = req.params.id;
    const userId = req.params.user_id;
    const userName = req.query.username;
    const userRealName = req.query.user_realname;

    let conn;
    try {
        conn = await oracledb.getConnection(dbConfig);

        // 게시글에 달린 댓글과 답글 삭제
        await conn.execute(
            `DELETE FROM comments WHERE post_id = :postId OR parent_comment_id IN (SELECT id FROM comments WHERE post_id = :postId)`,
            [postId, postId]
        );
        // 변경 사항 커밋
        await conn.commit();
        // 게시글 삭제
        await conn.execute(
            `DELETE FROM posts WHERE id = :id`,
            [postId]
        );

        // 변경 사항 커밋
        await conn.commit();

        // 삭제 후 게시판 메인 페이지로 리다이렉트
        res.redirect(`/boardMain?id=${userId}&username=${userName}&name=${userRealName}`);
    } catch (err) {
        console.error('게시글 삭제 중 오류 발생:', err);
        res.status(500).send('게시글 삭제 중 오류가 발생했습니다.');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error('오라클 연결 종료 중 오류 발생:', err);
            }
        }
    }
});

// 댓글 삭제 처리
app.post('/deleteComment/:id', async (req, res) => {
    // 로그인 여부 확인
    if (!req.session.loggedIn) {
        return res.redirect('/login'); // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
    }

    const commentId = req.params.id;
    const postId = req.body.post_id;

    let conn;
    try {
        conn = await oracledb.getConnection(dbConfig);

        // 댓글 삭제
        await conn.execute(
            `DELETE FROM comments WHERE id = :id OR parent_comment_id = :parent_comment_id`,
            { id: commentId, parent_comment_id: commentId }
        );

        // 변경 사항 커밋
        await conn.commit();

        // 삭제 후 상세 페이지로 리다이렉트
        res.redirect(`/detailPost/${postId}`);
    } catch (err) {
        console.error('댓글 삭제 중 오류 발생:', err);
        res.status(500).send('댓글 삭제 중 오류가 발생했습니다.');
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error('오라클 연결 종료 중 오류 발생:', err);
            }
        }
    }
});

// 댓글 수정 엔드포인트 추가
app.post('/editComment/:commentId', async (req, res) => {
    const { commentId } = req.params; // 요청에서 댓글 ID 가져오기
    const { content, post_id } = req.body; // 요청에서 수정된 내용 가져오기

    try {
        // 댓글 수정 쿼리 실행
        const connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `UPDATE comments SET content = :content WHERE id = :commentId`,
            { content, commentId }
        );
        // 삭제 후 상세 페이지로 리다이렉트
        res.redirect(`/detailPost/${post_id}`);
    } catch (error) {
        // 댓글 수정 실패 시 에러 응답 반환
        console.error('댓글 수정 에러:', error);
        res.status(500).send('댓글 수정 중 오류가 발생했습니다.');
    }
});

// =======================================
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

app.get('/', (req, res) => {
    res.sendFile('C:\\UHB\\rest_area\\build\\index.html');
});

app.use(express.static('C:\\UHB\\rest_area\\build'))




// 게시판 서버 시작
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});


app.get('*', (req, res) => {
    res.sendFile('C:\\UHB\\rest_area\\build\\index.html');
});