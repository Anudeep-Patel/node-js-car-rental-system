const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dateFns = require("date-fns");
const isValid = require("date-fns/isValid");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "carsrental.db");
let database = null;

const initializeDBAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Token Verification
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authorizationHeader = request.headers["authorization"];
  if (authorizationHeader !== undefined) {
    jwtToken = authorizationHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Mustang", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.category = payload.category;
        next();
      }
    });
  }
};

//Admin Validation
const isValidAdmin = (request, response, next) => {
  let { category } = request;
  if (category === "admin") {
    next();
  } else {
    response.status(401);
    response.send("Invalid User");
  }
};

//Validate Password
const validatePassword = (password) => {
  return password.length > 6;
};

//Register API
app.post("/register/", async (request, response) => {
  const { username, password, gender, age, category } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(getUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO user(username, password, gender, age, category)
        VALUES('${username}', '${hashedPassword}', '${gender}', ${age}, '${category}');`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("Account Created Successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User Already Exists!");
  }
});

//Login API
app.post("/login/", async (request, response) => {
  const { username, password, category } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { category: category };
      const jwtToken = jwt.sign(payload, "Mustang");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

//Filtered Cars List API
app.get("/cars/", authenticateToken, async (request, response) => {
  let getCarsQuery;
  const { brand, name, color, status } = request.query;
  if ("brand" in request.query && "name" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE brand = '${brand}' AND name = '${name}';`;
  } else if ("brand" in request.query && "color" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE brand = '${brand}' AND color = '${color}';`;
  } else if ("name" in request.query && "color" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE name = '${name}' AND color = '${color}';`;
  } else if ("brand" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE brand = '${brand}';`;
  } else if ("name" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE name = '${name}';`;
  } else if ("color" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE color = '${color}';`;
  } else if ("status" in request.query) {
    getCarsQuery = `SELECT * FROM cars 
        WHERE status = '${status}';`;
  }
  let carsData = await database.all(getCarsQuery);
  response.send(carsData);
});

//Validate Start Date
const validStartDate = (request, response, next) => {
  if ("start_time" in request.body) {
    const { start_time } = request.body;
    const isValidStartDate = isValid(new Date(start_time));
    if (isValidStartDate) {
      next();
    } else {
      response.status(400);
      response.send("Invalid Start Date");
    }
  } else {
    response.status(400);
    response.send("please enter the start date");
  }
};

//Validate End Date
const validEndDate = (request, response, next) => {
  if ("end_time" in request.body) {
    const { end_time } = request.body;
    const isValidEndDate = isValid(new Date(end_time));
    if (isValidEndDate) {
      next();
    } else {
      response.status(400);
      response.send("Invalid End Date");
    }
  } else {
    response.status(400);
    response.send("please enter the end date");
  }
};

//Bookings API
app.post(
  "/bookings/",
  authenticateToken,
  validStartDate,
  validEndDate,
  async (request, response) => {
    const {
      car_id,
      username,
      address,
      start_time,
      end_time,
      amount,
    } = request.body;
    const formattedStartDate = dateFns.format(
      new Date(start_time),
      "yyyy-MM-dd HH:mm"
    );
    const formattedEndDate = dateFns.format(
      new Date(end_time),
      "yyyy-MM-dd HH:mm"
    );
    const createBookingQuery = `INSERT INTO bookings(car_id, username, address, start_time, end_time, amount)
    VALUES(${car_id}, '${username}', '${address}', '${formattedStartDate}', '${formattedEndDate}', ${amount});`;
    await database.run(createBookingQuery);
    response.send("Booking Successful");
  }
);

//Feedback API
app.post("/feedback/", authenticateToken, async (request, response) => {
  const { username, description, rating } = request.body;
  const createFeedbackQuery = `INSERT INTO feedback(username, description, rating)
    VALUES('${username}', '${description}', '${rating}');`;
  await database.run(createFeedbackQuery);
  response.send("Feedback Submitted");
});

//Create Car API
app.post(
  "/cars/",
  authenticateToken,
  isValidAdmin,
  async (request, response) => {
    const { car_id, brand, name, color, status } = request.body;
    const createCarQuery = `INSERT INTO cars(car_id, brand, name, color, status)
      VALUES(${car_id}, '${brand}', '${name}', '${color}', '${status}');`;
    await database.run(createCarQuery);
    response.send("Car details added successfully");
  }
);

//Update Car API
app.put(
  "/cars/:carId",
  authenticateToken,
  isValidAdmin,
  async (request, response) => {
    const { carId } = request.params;
    let updateColumn;
    let updateCarQuery;
    if ("brand" in request.body) {
      updateColumn = "Brand";
      const { brand } = request.body;
      updateCarQuery = `Update cars SET brand = '${brand}' 
        WHERE car_id = ${carId};`;
    } else if ("name" in request.body) {
      updateColumn = "Name";
      const { name } = request.body;
      updateCarQuery = `Update cars SET name = '${name}' 
        WHERE car_id = ${carId};`;
    } else if ("color" in request.body) {
      updateColumn = "Color";
      const { color } = request.body;
      updateCarQuery = `Update cars SET color = '${color}' 
        WHERE car_id = ${carId};`;
    } else if ("status" in request.body) {
      updateColumn = "Status";
      const { status } = request.body;
      updateCarQuery = `Update cars SET status = '${status}' 
        WHERE car_id = ${carId};`;
    }
    await database.run(updateCarQuery);
    response.send(`${updateColumn} Updated`);
  }
);

//Delete Car API
app.delete(
  "/cars/:carId",
  authenticateToken,
  isValidAdmin,
  async (request, response) => {
    const { carId } = request.params;
    const deleteCarQuery = `DELETE FROM cars WHERE car_id = ${carId};`;
    await database.run(deleteCarQuery);
    response.send("Car Deleted");
  }
);

module.exports = app;
