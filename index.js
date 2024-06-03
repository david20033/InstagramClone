import express, { application } from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import multer from "multer";

const app = express();
const port = 3000;
const saltRounds = 10;

env.config();
const upload = multer(); //{ dest: "uploads/" });
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "secretword",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();
async function getProfilePicSRC(id) {
  try {
    const result1 = await db.query("select * from users where id=$1", [id]);
    const base64Image = result1.rows[0].profileimage.toString("base64");
    const profileImageUrl = `data:image/png;base64,${base64Image}`;
    return profileImageUrl;
  } catch (err) {
    return "images/default.png";
  }
}

app.get("/", async (req, res) => {
  if (req.isAuthenticated()) {
    const result = await db.query(
      "select images.id, images.imagedata, images.upload_date, images.likes, users.id as user_id, users.username, users.profileimage from images inner join users on images.user_id=users.id order by id desc"
    );
    const result1 = await db.query(
      "select * from likedby where usersliked_id=$1",
      [req.user.id]
    );
    console.log(req.user.id);
    res.render("index.ejs", {
      currUserId: req.user.id,
      profileImage: await getProfilePicSRC(req.user.id),
      postsArr: result.rows,
      likedPosts: result1.rows,
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});
app.get("/login", (req, res) => {
  res.render("login.ejs");
});
app.get("/inbox", async (req, res) => {
  if (req.isAuthenticated()) {
    const result = await db.query(
      "SELECT DISTINCT ON (message.to_id) users.id, users.fullname, users.profileimage, message.message_text FROM message INNER JOIN users ON users.id = message.to_id WHERE message.from_id = $1",
      [req.user.id]
    );
    var ChatProfileImages = [];
    for (var i = 0; i < result.rows.length; i++) {
      ChatProfileImages.push(await getProfilePicSRC(result.rows[i].id));
    }
    // console.log(result.rows[i].id);
    res.render("inbox.ejs", {
      currUserId: req.user.id,
      profileImage: await getProfilePicSRC(req.user.id),
      messages: result.rows,
      ChatProfileImagesSRC: ChatProfileImages,
    });
  } else {
    res.redirect("/login");
  }
});
app.get("/inbox:id", async (req, res) => {
  if (req.isAuthenticated()) {
    const result = await db.query("select * from users where id=$1", [
      req.params.id,
    ]);
    const result1 = await db.query(
      "select * from message where (from_id=$1 and to_id=$2) or (from_id=$2 and to_id=$1)",
      [req.user.id, req.params.id]
    );

    const result2 = await db.query(
      "SELECT DISTINCT ON (message.to_id) users.id, users.fullname, users.profileimage, message.message_text FROM message INNER JOIN users ON users.id = message.to_id WHERE message.from_id = $1",
      [req.user.id]
    );
    var ChatProfileImages = [];
    for (var i = 0; i < result2.rows.length; i++) {
      ChatProfileImages.push(await getProfilePicSRC(result2.rows[i].id));
    }
    res.render("inbox.ejs", {
      currUserId: req.user.id,
      profileImage: await getProfilePicSRC(req.user.id),
      currUser: result.rows[0],
      currUserProfilePicSRC: await getProfilePicSRC(req.params.id),
      convers: result1.rows,
      messages: result2.rows,
      ChatProfileImagesSRC: ChatProfileImages,
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/profile:id", async (req, res) => {
  if (req.isAuthenticated()) {
    var button1 = "Follow";
    const userId = req.params.id;
    const result = await db.query(
      "select imagedata from images where user_id=$1",
      [userId]
    );
    if (userId == req.user.id) {
      button1 = "Edit";
    }
    var images = [];
    for (var i = 0; i < result.rowCount; i++) {
      const base64Image = result.rows[i].imagedata.toString("base64");
      const imageUrl = `data:image/png;base64,${base64Image}`;
      images.push(imageUrl);
    }
    const result1 = await db.query("select * from users where id=$1", [userId]);
    res.render("profile.ejs", {
      imgArr: images,
      currUserId: req.user.id,
      currUser: result1.rows[0],
      profileImage: await getProfilePicSRC(req.user.id),
      VisitedProfileImage: await getProfilePicSRC(req.params.id),
      button1: button1,
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/post", async (req, res) => {
  if (req.isAuthenticated()) {
    res.render("post.ejs", {
      currUserId: req.user.id,
      profileImage: await getProfilePicSRC(req.user.id),
    });
  } else {
    res.redirect("/login");
  }
});
app.get("/image/:id", async (req, res) => {
  const imageId = req.params.id;

  try {
    // Execute SQL query to retrieve image data based on ID
    const result = await db.query("SELECT data FROM images WHERE id = $1", [
      imageId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).send("Image not found");
    }

    // Extract image data from the query result
    const imageData = result.rows[0].data;

    // Set appropriate headers for the response
    res.setHeader("Content-Type", "image/png"); // Assuming the image format is JPEG
    res.send(imageData); // Send the image data back to the client
    console.log("ok lets gooo");
  } catch (err) {
    console.error("Error retrieving image:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/search", async (req, res) => {
  res.render("components/search.ejs", {
    currUserId: req.user.id,
    profileImage: await getProfilePicSRC(req.user.id),
  });
});

app.get("/results", async (req, res) => {
  res.render("searchResults.ejs", {
    currUserId: req.user.id,
    profileImage: await getProfilePicSRC(req.user.id),
  });
});
app.get("/edit", async (req, res) => {
  if (req.isAuthenticated()) {
    const result = await db.query("select * from users where id=$1", [
      req.user.id,
    ]);
    res.render("editprofile.ejs", {
      user: result.rows[0],
      profileImage: await getProfilePicSRC(req.user.id),
    });
  } else {
    res.redirect("/login");
  }
});
app.post("/register", async (req, res) => {
  const email = req.body.email;
  const username = req.body.username;
  const password = req.body.password;

  try {
    const result = await db.query("select * from users where email=$1", [
      email,
    ]);
    const result1 = await db.query("select * from users where username=$1", [
      username,
    ]);
    if (result.rows.length != 0) {
      res.send("User with this email already exists");
    } else if (result1.rows.length != 0) {
      res.send("User with this username already exists");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error(err);
        } else {
          console.log("hashed password: " + hash);
          const result = await db.query(
            "insert into users(email, fullName, username, password, description) values ($1,$2,$3,$4,$5) RETURNING  email, password",
            [email, req.body.name, username, hash, ""]
          );
          const user = result.rows[0];
          console.log(user);
          req.login(user, (err) => {
            console.log(err);
            res.redirect("/login");
          });
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

app.post("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.post("/post", upload.single("image"), async (req, res) => {
  try {
    const currUserId = req.user.id;
    const file = req.file;
    console.log(file);
    const result = await db.query(
      "INSERT INTO images (imageData, user_id) VALUES ($1, $2)",
      [file.buffer, currUserId]
    );
    res.redirect("/");
  } catch (err) {
    console.error("Error uploading image:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/search", async (req, res) => {
  if (req.isAuthenticated) {
    const searchTerm = req.body.search;
    console.log(`${searchTerm}%`);
    const result = await db.query(
      "SELECT * FROM users where fullname ILIKE $1",
      [`${searchTerm}%`]
    );
    var ImagesURL = [];
    for (var i = 0; i < result.rowCount; i++) {
      ImagesURL.push(await getProfilePicSRC(result.rows[i].id));
    }
    console.log(result.rows);
    res.render("searchResults.ejs", {
      results: result.rows,
      currUserId: req.user.id,
      profileImage: await getProfilePicSRC(req.user.id),
      ImagesURL: ImagesURL,
    });
  } else {
    res.redirect("/");
  }
});

app.post("/edit", upload.single("image"), async (req, res) => {
  try {
    const username = req.body.username;
    const fullname = req.body.fullname;
    const description = req.body.description;

    await db.query(
      "UPDATE users SET username = $1, fullname = $2, description = $3 WHERE id = $4",
      [username, fullname, description, req.user.id]
    );
  } catch (err) {}
  try {
    var file = req.file;
    // console.log(file);
    try {
      const result = await db.query(
        "update users set profileimage = $1 where id=$2",
        [file.buffer, req.user.id]
      );
    } catch (err) {
      res.redirect("/profile" + req.user.id);
    }
    res.redirect("/profile" + req.user.id);
  } catch (err) {
    console.error("Error uploading image:", err);
    // res.redirect("/profile" + req.user.id);
  }
});

app.post("/like", async (req, res) => {
  const postId = req.body.postId;
  const newLikes = req.body.newLikes;
  await db.query("update images set likes = $1 where id=$2", [
    newLikes,
    postId,
  ]);

  try {
    await db.query(
      "insert into likedBy(post_id, usersliked_id) values ($1,$2)",
      [postId, req.user.id]
    );
  } catch (err) {
    console.log(err);
  }
  res.redirect("/");
});
app.post("/dislike", async (req, res) => {
  const postId = req.body.postId;
  const newLikes = req.body.newLikes;
  await db.query("update images set likes = $1 where id=$2", [
    newLikes,
    postId,
  ]);

  try {
    await db.query("delete from likedBy where post_id=$1", [postId]);
  } catch (err) {
    console.log(err);
  }
  res.redirect("/");
});

app.post("/sent", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      await db.query(
        "insert into message(from_id, to_id, message_text) values ($1,$2,$3)",
        [req.user.id, req.body.to_id, req.body.message]
      );
      res.redirect("/inbox" + req.body.to_id);
    } catch (err) {
      console.log(error);
    }
  } else {
    res.redirect("/login");
  }
});

app.all("*", (req, res) => {
  res.render("notFound.ejs");
});

passport.use(
  "local",
  new LocalStrategy(async (username, password, done) => {
    try {
      const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [
        username,
      ]);
      if (rows.length === 0) {
        return done(null, false, { message: "Incorrect username." });
      }

      const user = rows[0];
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return done(null, false, { message: "Incorrect password." });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log("Server is running on port " + port);
});
