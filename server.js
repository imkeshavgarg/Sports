const express = require("express");
const mysql2 = require("mysql2");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const genAI = new GoogleGenerativeAI("AIzaSyBs-pHFv4qbE2J79yKh26_Wsv7DSVi5Wms");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const app = express();

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.listen(2004, () => {
  console.log("Server started on port 2004");
});

cloudinary.config({
  cloud_name: "dfyxjh3ff",
  api_key: "261964541512685",
  api_secret: "PfRVIo1IagO5z_ZnNFI1TQ7DOLc",
});

const dbConfig =
  "mysql://avnadmin:AVNS_znTOPWETXF6cZedcyTV@mysql-3c64655e-nodeprojectai.c.aivencloud.com:28709/defaultdb?ssl-mode=REQUIRED";

const db = mysql2.createConnection(dbConfig);
db.connect((err) => {
  if (err) console.error("DB connection failed:", err.message);
  else console.log("Connected to Aiven MySQL");
});

async function extractAadhaarFromImage(imgUrl) {
  const prompt = `
You are an OCR agent. Read the Aadhaar card image. 
Return output in **ONLY** this strict JSON format:
{ "name": "", "gender": "", "dob": "" }

DO NOT include explanation, quotes, or markdown.
`.trim();

  const imageBuffer = await fetch(imgUrl).then((res) => res.arrayBuffer());

  const result = await model.generateContent([
    {
      inlineData: {
        data: Buffer.from(imageBuffer).toString("base64"),
        mimeType: "image/jpeg",
      },
    },
    prompt,
  ]);

  const rawText = result.response.text();
  console.log(" Gemini Raw Output:\n", rawText);

  try {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const jsonData = JSON.parse(cleaned);
    return jsonData;
  } catch (e) {
    console.error("JSON parse error:", e.message);
    throw new Error("Gemini returned invalid JSON.");
  }
}


app.post("/extract-aadhaar-ai", async (req, res) => {
  if (!req.files?.aadhaar) {
    return res.status(400).send({ error: "Aadhaar image is required." });
  }

  const file = req.files.aadhaar;
  const savePath = path.join(uploadDir, file.name);

  try {
    await file.mv(savePath);

    const uploadRes = await cloudinary.uploader.upload(savePath);

    const extracted = await extractAadhaarFromImage(uploadRes.url);

    return res.json(extracted);
  } catch (err) {
    console.error("AI Aadhaar Extraction Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

//////////////////////// signup//////////////////////////////////////
app.post("/server-signup", (req, res) => {
  const email = req.body.txtEmail;
  const password = req.body.txtPwd;
  const usertype = req.body.comboUser;

  const sql = `
    INSERT INTO users (emailid, password, usertype, dos, status)
    VALUES (?, ?, ?, CURRENT_DATE(), 1)
  `;

  db.query(sql, [email, password, usertype], (err) => {
    if (err) {
      res.status(400).send("Signup failed: " + err.message);
    } else {
      res.send("Signup successful!");
    }
  });
});

//////////////////////////////login//////////////////////////////////////////////
// app.get("/do-login", function (req, res) {
//   let email = req.query.txtEmail;
//   let pwd = req.query.txtPwd;

//   db.query(
//     "SELECT * FROM users WHERE emailid=? AND password=?",
//     [email, pwd],
//     function (err, allRecords) {
//       if (err) {
//         res.send(err.message);
//         return;
//       }

//       if (allRecords.length === 1) {
//         let status = allRecords[0].status;
//         if (status == 1) res.send("Valid");
//         else res.send("Blocked");
//       } else {
//         res.send("Wrong emailid /pwd");
//       }
//     }
//   );
// });
app.get("/do-login", function (req, res) {
  let email = req.query.txtEmail;
  let pwd = req.query.txtPwd;

  db.query(
    "SELECT * FROM users WHERE emailid=? AND password=?",
    [email, pwd],
    function (err, allRecords) {
      if (err) {
        console.log("DB Error:", err);
        res.send(err.message);
        return;
      }

      if (allRecords.length === 0) {
        console.log("Invalid login attempt");
        res.send("Invalid");
      } else if (allRecords[0].status == 1) {
        let role = allRecords[0].usertype;
        console.log("Role from DB:", role); // This should print "player", "organizer", etc.
        if (role) {
          res.send(role.trim().toLowerCase());
        } else {
          res.send("Invalid"); // fallback if usertype is null
        }
      } else {
        console.log("Blocked user login");
        res.send("Blocked");
      }
    }
  );
});



///////////////////////////////////////////////////////////////////////////////////////
app.post("/org-details-save", async function (req, res) {
    let picurl = "nopic.jpg"; 

    try {
        if (req.files && req.files.certPic) {
            const fName = req.files.certPic.name;
            const fullPath = path.join(__dirname, "/public/uploads/", fName);

           await req.files.certPic.mv(fullPath);
            const result = await cloudinary.uploader.upload(fullPath);
            picurl = result.secure_url;
            console.log("Certificate uploaded:", picurl);
        }
        const {emailid,orgName,regNo,address,city,sports,website,insta,orgHead,contact,otherInfo,} = req.body;
        const sql = `
            INSERT INTO organizers 
            (emailid, orgname, regnumber, address, city, sports, website, insta, head, contact, picurl, otherinfo, regdate)VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_DATE)`;

        db.query(sql, [emailid,orgName,regNo,address,city,sports,website,insta,orgHead,contact,picurl,otherInfo], function (err) {
            if (err) {
                console.error("Insert error:", err.message);
                res.send("Insert Failed: " + err.message);
            } else {
                res.send("Record Saved Successfully");
            }
        });

    } catch (err) {
        console.error("Server error:", err.message);
        res.status(500).send("Server Error: " + err.message);
    }
});

/////////////////////////////////////////////////////////////////////////////////////////////////
app.post("/org-update", async function (req, res) {
    let picurl = "";

    if (req.files != null) {
        let fName = req.files.certPic.name;
        let fullPath = __dirname + "/public/uploads/" + fName;
        req.files.certPic.mv(fullPath);

        await cloudinary.uploader.upload(fullPath).then(function (picUrlResult) {
            picurl = picUrlResult.secure_url;
            console.log(picurl);
        });
    } else {
        picurl = "nopic.jpg";
    }

    let emailid = req.body.emailid;
    let orgName = req.body.orgName;
    let regNo = req.body.regNo;
    let address = req.body.address;
    let city = req.body.city;
    let sports = req.body.sports;
    let website = req.body.website;
    let insta = req.body.insta;
    let orgHead = req.body.orgHead;
    let contact = req.body.contact;
    let otherInfo = req.body.otherInfo;

    let sql = "update organizers set orgname=?, regnumber=?, address=?, city=?, sports=?, website=?, insta=?, head=?, contact=?, otherinfo=?, picurl=? where emailid=?";
    let values = [orgName, regNo, address, city, sports, website, insta, orgHead, contact, otherInfo, picurl, emailid];

    db.query(sql, values, function (errKuch, result) {
        if (errKuch == null) {
            if (result.affectedRows == 1)
                res.send("Record Updated Successfully...🎉");
            else
                res.send("Invalid Email ID");
        } else {
            res.send(errKuch.message);
        }
    });
});


//////////////////////////////////////////////////////////////////////////////////////////////
app.get("/org-get-one", function (req, res) {
  const emailid = req.query.emailid;

  db.query("SELECT * FROM organizers WHERE emailid = ?", [emailid], function (err, result) {
    if (err) res.send(err.message);
    else if (result.length === 0) res.send("No record found");
    else res.json(result[0]);
  });
});

//////////////////////////////////////////////////////////////////////////////////////////////

app.post("/publish-event", async function (req, res) {
  try {
    const {
      emailid, title, event_date, event_time, address, city,
      sports, minage, maxage, lastdate, fee, prize, contact
    } = req.body;

    const sql = `
      INSERT INTO tournaments (
        emailid, title, event_date, event_time, address, city,
        sports, minage, maxage, lastdate, fee, prize, contact, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)
    `;

    db.query(sql, [
      emailid, title, event_date, event_time, address, city,
      sports, minage, maxage, lastdate, fee, prize, contact
    ], function (err) {
      if (err) {
        console.error("Insert error:", err.message);
        res.send("Insert Failed: " + err.message);
      } else {
        res.send("Tournament Published Successfully");
      }
    });

  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
});


app.get("/do-fetch-all-users", function (req, res) {
  const emailid = req.query.emailid;

   db.query("SELECT * FROM tournaments WHERE emailid = ?", [emailid], function (err, allRecords) {
    if (err) {
      console.error("DB error:", err.message);
      res.status(500).send("Database error: " + err.message);
    } else {
      res.json(allRecords);
    }
  });
});

    
    
app.get("/delete-one",function(req,resp)
{
    console.log(req.query)
    let emailid=req.query.emailidKuch;;;;;
    let pwd=req.query.pwdKuch;

     db.query("delete from tournaments where emailid=?",[emailid],function(errKuch,result)
    {
        if(errKuch==null)
                {
                    if(result.affectedRows==1)
                        resp.send(emailid+" Deleted Successfulllyyyy...");
                    else
                        resp.send("Invalid Email id");
                }
                else
                resp.send(errKuch);

    })
}) 

/////////////////////player////////////////////////////////////
app.post("/save-player-profile", async function (req, res) {
  try {
    let aadhaarURL = "nopic.jpg";
    let profileURL = "nopic.jpg";

    if (req.files?.aadhaar) {
      const fullPath = path.join(uploadDir, req.files.aadhaar.name);
      await req.files.aadhaar.mv(fullPath);
      const uploaded = await cloudinary.uploader.upload(fullPath);
      aadhaarURL = uploaded.secure_url;
    }

    if (req.files?.profilepic) {
      const fullPath = path.join(uploadDir, req.files.profilepic.name);
      await req.files.profilepic.mv(fullPath);
      const uploaded = await cloudinary.uploader.upload(fullPath);
      profileURL = uploaded.secure_url;
    }

    const {
      emailid,
      name,
      dob,
      gender,
      address,
      contact,
      games,
      otherinfo
    } = req.body;

    if (!emailid) {
      return res.status(400).send("Email ID is required.");
    }

    const sql = `
      INSERT INTO players 
      (emailid, acardpicurl, profilepicurl, name, dob, gender, address, contact, game, otherinfo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
      emailid,
      aadhaarURL,
      profileURL,
      name,
      dob,
      gender,
      address,
      contact,
      games,
      otherinfo
    ], (err) => {
      if (err) {
        console.error("Insert failed:", err.message);
        res.status(500).send("Insert failed: " + err.message);
      } else {
        res.send("Player data saved successfully.");
      }
    });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
});


app.get("/get-player-by-email", (req, res) => {
  const emailid = req.query.email;
  db.query("SELECT * FROM players WHERE emailid = ?", [emailid], (err, result) => {
    if (err) return res.status(500).send("Database error: " + err.message);
    if (result.length === 0) return res.send("No player found");
    res.json(result[0]);
  });
});

////////////////////profileplayer.html/////////////////////////

app.post("/modify-player-profile", async function (req, res) {
    let acardpicurl = "";
    let profilepicurl = "";

    try {
        let emailid = req.body.emailid;
        let name = req.body.name;
        let dob = req.body.dob;
        let gender = req.body.gender;
        let address = req.body.address;
        let contact = req.body.contact;
        let games = req.body.games;
        let otherinfo = req.body.otherinfo;

        if (!dob || dob.trim() === "") {
            return res.status(400).send("Date of Birth (DOB) is required.");
        }
        db.query("SELECT acardpicurl, profilepicurl FROM players WHERE emailid = ?", [emailid], async function (err, result) {
            if (err) {
                console.error("Fetch error:", err.message);
                return res.status(500).send("Fetch failed: " + err.message);
            }
            if (result.length === 0) {
                return res.status(404).send("Player not found.");
            }

            acardpicurl = result[0].acardpicurl || "nopic.jpg";
            profilepicurl = result[0].profilepicurl || "nopic.jpg";

            if (req.files?.aadhaar) {
                let fullPath = __dirname + "/public/uploads/" + req.files.aadhaar.name;
                await req.files.aadhaar.mv(fullPath);
                let uploadResult = await cloudinary.uploader.upload(fullPath);
                acardpicurl = uploadResult.secure_url;
            }

            if (req.files?.profilepic) {
                let fullPath = __dirname + "/public/uploads/" + req.files.profilepic.name;
                await req.files.profilepic.mv(fullPath);
                let uploadResult = await cloudinary.uploader.upload(fullPath);
                profilepicurl = uploadResult.secure_url;
            }

            let sql = "UPDATE players SET acardpicurl=?, profilepicurl=?, name=?, dob=?, gender=?, address=?, contact=?, game=?, otherinfo=? WHERE emailid=?";
            let values = [acardpicurl, profilepicurl, name, dob, gender, address, contact, games, otherinfo, emailid];

            db.query(sql, values, function (errKuch, result) {
                if (errKuch == null) {
                    if (result.affectedRows == 1)
                        res.send("Player profile updated successfully.");
                    else
                        res.send("Invalid Email ID");
                } else {
                    res.send("Update failed: " + errKuch.message);
                }
            });
        });

    } catch (err) {
        console.error("Server error:", err.message);
        res.status(500).send("Server error: " + err.message);
    }
});

app.post("/extract-aadhaar-ai", async function (req, res) {
  try {
    if (!req.files?.aadhaar) {
      return res.status(400).send("Aadhaar image is missing.");
    }

    const localPath = path.join(uploadDir, req.files.aadhaar.name);
    await req.files.aadhaar.mv(localPath);

    const cloudRes = await cloudinary.uploader.upload(localPath);
    const imgUrl = cloudRes.secure_url;

    const aadhaarData = await extractAadhaarFromImage(imgUrl);

    res.json(aadhaarData);

  } catch (err) {
    console.error("AI Aadhaar Extraction Error:", err.message);
    res.status(500).send("AI Aadhaar extraction failed: " + err.message);
  }
});

///////////////////admin user console//////////////////
app.get("/fetch-all-users", (req, res) => {
  db.query("SELECT * FROM users ORDER BY dos DESC", (err, result) => {
    if (err) {
      console.error("DB Error:", err.message);
      return res.status(500).send("Database error: " + err.message);
    }

    res.json(result); 
  });
});


app.get("/update-user-status", (req, res) => {
  const { emailid, status } = req.query;

  if (!emailid || (status !== "0" && status !== "1")) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const sql = "UPDATE users SET status = ? WHERE emailid = ?";
  db.query(sql, [status, emailid], (err, result) => {
    if (err) {
      console.error("Update Error:", err.message);
      return res.status(500).json({ error: "Failed to update status", details: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "No user found with the given email ID" });
    }

    const statusText = status === "1" ? "Active" : "Blocked";
    res.json({ message: `User status updated to ${statusText}` });
  });
});

/////////////////////player-event//////////////////////
app.get("/do-fetch-all-tournaments",function(req,resp)
{
  console.log(req.query)
        db.query("select * from tournaments where city=? and sports=?",[req.query.kuchCity,req.query.kuchGame],function(err,allRecords)
        {
          console.log(allRecords)
                    resp.send(allRecords);
        })
})

app.get("/do-fetch-all-cities",function(req,resp)
{
        db.query("select distinct city from tournaments",function(err,allRecords)
        {
                    resp.send(allRecords);
        })
})

///////////////////adminorganizer.html//////////////////////////////
app.get("/fetch-all-organizations", (req, res) => {
  const query = "SELECT * FROM organizers ORDER BY regdate DESC";
  db.query(query, (err, result) => {
    if (err) return res.status(500).send("DB Error: " + err.message);
    res.json(result);
  });
});

app.get("/fetch-all-players", (req, res) => {
  const sql = "SELECT * FROM players ORDER BY dob DESC";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).send("DB Error: " + err.message);
    res.json(result);
  });
});

////////////////player-events///////////////////
app.post("/update-password", (req, res) => {
  const { emailid, oldpwd, newpwd } = req.body;
  const sql = "UPDATE users SET password=? WHERE emailid=? AND password=?";
  db.query(sql, [newpwd, emailid, oldpwd], function (err, result) {
    if (err) {
      res.status(500).send("error");
    } else if (result.affectedRows > 0) {
      res.send("success");
    } else {
      res.send("fail");
    }
  });
});
