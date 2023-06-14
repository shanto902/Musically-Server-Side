const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_KEY);
const port = process.env.PORT || 5000;

// Middleware

app.use(cors());
app.use(express.json());

const verifyToken = (req, res, next) => {
  const tokenAuthorization = req.headers.authorization;
  if (!tokenAuthorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access" });
  }
  const token = tokenAuthorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@vista-vocal.6rsob8b.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const classCollection = client.db("vocal-vista").collection("classes");
    const userCollection = client.db("vocal-vista").collection("users");
    const selectedClassCollection = client
      .db("vocal-vista")
      .collection("selectedClass");
    const paymentCollection = client.db("vocal-vista").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden message" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden message" });
      }
      next();
    };

    // User Related APIs
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/instructors", async (req, res) => {
      try {
        const instructors = await userCollection
          .find({ role: "instructor" })
          .toArray();
        res.send(instructors);
      } catch (error) {
        console.error("Error retrieving instructors:", error);
        res
          .status(500)
          .json({
            error: "An error occurred while retrieving instructor data.",
          });
      }
    });

    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.send({ role: "student" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const role = user ? user.role : "student";
      res.send({ role: role });
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Class related apis
    app.get("/classes", async (req, res) => {
      const result = await classCollection
        .find({ status: "approve" })
        .toArray();
      res.send(result);
    });

    app.get("/all-classes", verifyToken, verifyAdmin, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.patch("/classes/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedClassData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          nameOfClass: updatedClassData.nameOfClass,
          classImage: updatedClassData.classImage,
          availableSeats: updatedClassData.availableSeats,
          price: updatedClassData.price,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get(
      "/classes/instructor/:email",
      verifyToken,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email;

        if (!email) {
          return res.send([]);
        }

        const decodedEmail = req.decoded.email;

        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden Access" });
        }

        const query = { instructorEmail: email };
        const result = await classCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.post("/classes/select", verifyToken, async (req, res) => {
      const item = req.body;
      const user = await userCollection.findOne({ email: item.email });
    
      if (user && user.role === "student") {
        const existingPurchase = await selectedClassCollection.findOne({
          email: item.email,
          classId: item.classId
        });
    
        if (existingPurchase) {
          res.status(400).send("You have already selected this class.");
        } else {
          const result = await selectedClassCollection.insertOne(item);
          res.send(result);
        }
      } else {
        res.status(403).send("Only students can enroll in classes.");
      }
    });

    app.get("/classes/selected-class", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/classes", verifyToken, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.patch("/classes/approve/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approve",
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/deny/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "deny",
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/feedback/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: req.body.feedback,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      if (result.modifiedCount === 1) {
        res.send({ message: "Feedback updated successfully" });
      } else {
        res.status(404).send({ error: true, message: "Class not found" });
      }
    });

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
    
      const insertResult = await paymentCollection.insertOne(payment);
    
      const query = {
        _id: new ObjectId(payment.itemId)
      };
    
      let deleteResult;
    
      const selectedClass = await selectedClassCollection.findOne(query);
      if (selectedClass) {
        const classId = selectedClass.classId;
    
        const updatedClass = await classCollection.findOne({ _id: new ObjectId(classId) });
        if (updatedClass.availableSeats > 0) {
          const updateResult = await classCollection.updateOne(
            { _id: new ObjectId(classId) },
            {
              $inc: {
                availableSeats: -1,
                enrolled: 1,
              },
            }
          );
    
          // Remove item from selectedClassCollection
          await selectedClassCollection.deleteOne({ _id: selectedClass._id });
        } else {
          return res.status(400).send({ error: "Class Seat Full" });
        }
      }
    
      res.send({ insertResult, deleteResult });
    });
    

    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("WoW! Its Working");
});
app.listen(port, () => {
  console.log(`VistaVocal is Running on: ${port}`);
});
