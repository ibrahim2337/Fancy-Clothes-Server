const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const SSLCommerzPayment = require("sslcommerz-lts");


const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false; //true for live, false for sandbox

const port = process.env.PORT || 5000;

//middleware

app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j3spxdo.mongodb.net/?retryWrites=true&w=majority`;



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
    // await client.connect();

    const courseCollection = client.db("fancy-clothes-db").collection("course");

    const cartCollection = client.db("fancy-clothes-db").collection("cart");
    const userCollection = client.db("fancy-clothes-db").collection("user");
    const orderCollection = client.db("fancy-clothes-db").collection("order");

    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = user.email;
      const query = { email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post("/order", async (req, res) => {
      const order = req.body;
      const { price, title, customerName, customerEmail } = order;
      const tran_id = new ObjectId().toString();
      const data = {
        total_amount: price,
        currency: "BDT",
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `https://fancy-clothes-feec4.web.app/payment/success/${tran_id}`,
        fail_url: `https://fancy-clothes-feec4.web.app/payment/fail/${tran_id}`,
        cancel_url: "http://localhost:3030/cancel",
        ipn_url: "http://localhost:3030/ipn",
        shipping_method: "Courier",
        product_name: title,
        product_category: "Electronic",
        product_profile: "general",
        cus_name: customerName,
        cus_email: customerEmail,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };

      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        res.send({ url: GatewayPageURL });
        const finalOrder = {
          order,
          paidStatus: false,
          transactionId: tran_id,
        };

        const result = orderCollection.insertOne(finalOrder);
      });

      app.post("/payment/success/:tran_id", async (req, res) => {
        const { tran_id } = req.params;

        const result = await orderCollection.updateOne(
          {
            transactionId: tran_id,
          },
          {
            $set: {
              paidStatus: true,
            },
          }
        );

        if (result.modifiedCount > 0) {
          const currentOrder = await orderCollection.findOne({
            transactionId: tran_id,
          });
          const currentOrderId = currentOrder.order.courseId;
          console.log(currentOrderId);
          const updateSeat = await courseCollection.updateOne(
            { courseId: currentOrderId },
            { $inc: { available_seats: -1, totalEnroll: 1 } }
          );

          res.redirect(`https://fancy-clothes-feec4.web.app/payment/success/${tran_id}`);
        }
      });
      app.post("/payment/fail/:tran_id", async (req, res) => {
        const { tran_id } = req.params;
        const result = await orderCollection.deleteOne({
          transactionId: tran_id,
        });
        if (result.deletedCount) {
          res.redirect(`https://fancy-clothes-feec4.web.app/payment/fail/${tran_id}`);
        }
      });
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      console.log(result);
      res.send(result);
    });

    app.get("/popular-course", async (req, res) => {
      const data = await courseCollection
        .find({})
        .sort({ totalEnroll: -1 })
        .limit(6)
        .toArray();
      res.send(data);
    });

    app.patch("/users/admin/:id",  async (req, res) => {
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

    app.get("/get-my-course/:email", async (req, res) => {
      const { email } = req.params;
      const myCourse = await courseCollection
        .find({
          "instructor.email": email,
        })
        .toArray();

      res.send(myCourse);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    app.delete("/users/delete/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/course", async (req, res) => {
      const data = courseCollection.find({ status: "approve" });
      const result = await data.toArray();
      res.send(result);
    });

    app.get("/course-all", async (req, res) => {
      const data = courseCollection.find({});
      const result = await data.toArray();
      res.send(result);
    });

    app.patch("/update/course", async (req, res) => {
      console.log(req.body);
      const { courseId } = req.body;
      const result = await courseCollection.updateOne(
        { courseId: courseId },
        {
          $set: {
            status: "approve",
          },
        }
      );
      res.send(result);
    });

    app.patch("/update/course/deny", async (req, res) => {
      console.log(req.body);
      const { courseId, feedback } = req.body;
      const result = await courseCollection.updateOne(
        { courseId: courseId },
        {
          $set: {
            status: "deny",
            feedback: feedback,
          },
        }
      );
      res.send(result);
    });

    app.post("/course", async (req, res) => {
      const newCourse = req.body;
      const {
        name,
        description,
        price,
        duration,
        available_seats,
        image,
        instructor,
      } = newCourse;

      const bigCourseData = await courseCollection
        .find({})
        .sort({ courseId: -1 })
        .limit(1)
        .toArray();

      let courseId = bigCourseData[0].courseId + 1;

      const oldCourse = await courseCollection.findOne({
        "instructor.email": instructor.email,
      });
      let courseQuantity;
      if (oldCourse === null) {
        courseQuantity = 1;
      } else {
        courseQuantity = parseInt(oldCourse?.instructor?.course_taken) + 1;
      }
      data = {
        name: name,
        courseId: courseId,
        description: description,
        price: price,
        status: false,
        totalEnroll: 0,
        duration: duration,
        available_seats: parseInt(available_seats),
        image: image,
        instructor: {
          name: instructor.name,
          email: instructor.email,
          image: instructor.image,
          course_name: instructor.course_name,
          course_taken: courseQuantity,
        },
      };

      const result = await courseCollection.insertOne(data);
      res.send(result);
    });

    app.get("/courses", async (req, res) => {
      const { email } = req.query;

      const query = { "instructor.email": email };
      const result = await courseCollection.find(query).toArray();

      res.send(result);
    });

    app.delete("/course/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/course-cart", async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.get("/get_instructors", async (req, res) => {
      const allInstructor = await courseCollection
        .find()
        .project({ instructor: 1 })
        .toArray();
      console.log(allInstructor);

      const filteredData = Object.values(
        allInstructor.reduce((acc, { instructor }) => {
          const { email, course_taken } = instructor;
          if (
            !acc[email] ||
            course_taken > acc[email].instructor.course_taken
          ) {
            acc[email] = { instructor };
          }
          return acc;
        }, {})
      );

      res.send(filteredData);
    });

    app.get("/course-cart",  async (req, res) => {
      const email = req.query.email;

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/course/delete/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/my-enroll-course/:email", async (req, res) => {
      const { email } = req.params;
      const result = await orderCollection
        .find({ "order.customerEmail": email })
        .sort({ "order.price": 1 })
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
