const express= require('express');
const app =express();
const cors = require('cors');

require('dotenv').config();
const SSLCommerzPayment = require("sslcommerz-lts");


const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false;

const port = process.env.PORT || 5000;

//middleware

app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j3spxdo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const courseCollection = client.db("fancy-clothes").collection("course");
    const cartCollection = client.db("fancy-clothes").collection("cart");
    const orderCollection = client.db("fancy-clothes").collection("order");


    app.get('/course', async(req,res)=>{
      const cursor = courseCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    
    })

    app.post("/course-cart", async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });
    app.get("/course-cart", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      

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
    app.post("/order", async (req, res) => {
      const order = req.body;
      const { price, title, customerName, customerEmail } = order;
      const tran_id = new ObjectId().toString();
      const data = {
        total_amount: price,
        currency: "BDT",
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `http://localhost:5173/payment/success/${tran_id}`,
        fail_url: `http://localhost:5173/payment/fail/${tran_id}`,
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

          res.redirect(`http://localhost:5173/payment/success/${tran_id}`);
        }
      });
      app.post("/payment/fail/:tran_id", async (req, res) => {
        const { tran_id } = req.params;
        const result = await orderCollection.deleteOne({
          transactionId: tran_id,
        });
        if (result.deletedCount) {
          res.redirect(`http://localhost:5173/payment/fail/${tran_id}`);
        }
      });
    });


    // app.get("/my-enroll-course/:email", async (req, res) => {
    //   const { email } = req.params;
    //   const result = await orderCollection
    //     .find({ "order.customerEmail": email })
    //     .sort({ "order.price": 1 })
    //     .toArray();
    //   res.send(result);
    // });


    






    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);






app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})