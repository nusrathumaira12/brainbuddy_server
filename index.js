const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');




dotenv.config()
app.use(cors());
app.use(express.json())

const port = process.env.PORT || 5001;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qnxzilo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let sessionCollection;
let reviewCollection;
let bookedSessionCollection;


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('studySessionDB')
    sessionCollection = db.collection('sessions')
    reviewCollection = db.collection('reviews')
    bookedSessionCollection= db.collection('bookedSession')

    app.get('/sessions/:id' , async(req,res)=> {
const {id} = req.params;
const session = await sessionCollection.findOne({_id: new ObjectId(id)})
res.send(session)
    })

    app.get('/reviews', async (req, res) => {
        const { sessionId } = req.query;
        const reviews = await reviewCollection.find({ sessionId }).toArray();
        res.send(reviews);
      });
      
    //   book a session
      app.post('/bookedSession', async(req,res) => {
        const booking = req.body;
        const result = await bookedSessionCollection.insertOne(booking)
        res.send(result);
      })

    //   get all booked session for a specific user
      app.get('/bookedSession', async(req,res) => {
        const { email } = req.query;
        const sessions = await bookedSessionCollection.find({ studentEmail: email }).toArray()
        res.send(sessions)
      })

      app.get('/sessions', async(req,res) => {
        const { status } = req.query;
        const filter = status ? { status } : {};
        const sessions = await sessionCollection.find(filter).toArray();
        res.send(sessions);


      })

      app.post('/reviews', async (req, res) => {
        const review = req.body;
        const result = await reviewCollection.insertOne(review);
        res.send(result);
      });
   
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/' , (req,res) => {
    res.send('student server is running')
})

app.listen(port, ()=> {
    console.log(`Server is listening on port ${port}`)
})