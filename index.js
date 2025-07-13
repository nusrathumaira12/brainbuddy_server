const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5001;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qnxzilo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const db = client.db('studySessionDB');
const sessionCollection = db.collection('sessions');
    const reviewCollection = db.collection('reviews');
    const bookedSessionCollection = db.collection('bookedSession');

    // ✅ Get all sessions (optional filter by status)
    app.get('/sessions', async (req, res) => {
      try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        const sessions = await sessionCollection.find(filter).toArray();
        res.send(sessions);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching sessions' });
      }
    });

    // ✅ Get single session by ID
    app.get('/sessions/:id', async (req, res) => {
      const { id } = req.params;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid session ID' });
        }
        const session = await sessionCollection.findOne({ _id: new ObjectId(id) });
        if (!session) {
          return res.status(404).send({ message: 'Session not found' });
        }
        res.send(session);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // ✅ Get all reviews (optional filter by sessionId)
    app.get('/reviews', async (req, res) => {
      const { sessionId } = req.query;
      try {
        const filter = sessionId ? { sessionId } : {};
        const reviews = await reviewCollection.find(filter).toArray();
        res.send(reviews);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching reviews' });
      }
    });

    // ✅ Post a review
    app.post('/reviews', async (req, res) => {
      try {
        const review = req.body;
        const result = await reviewCollection.insertOne(review);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error submitting review' });
      }
    });

    // ✅ Book a session
    app.post('/bookedSession', async (req, res) => {
      try {
        const booking = req.body;
        const result = await bookedSessionCollection.insertOne(booking);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error booking session' });
      }
    });

    // ✅ Get all booked sessions for a user
    app.get('/bookedSession', async (req, res) => {
      const { email } = req.query;
      try {
        const sessions = await bookedSessionCollection.find({ studentEmail: email }).toArray();
        res.send(sessions);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching booked sessions' });
      }
    });

    // ✅ Test root route
    app.get('/', (req, res) => {
      res.send('Study session server is running');
    });

    // ✅ Confirm DB connected
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
