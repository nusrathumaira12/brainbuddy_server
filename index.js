const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
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
    const bookedSessionCollection = db.collection('bookedSessions');
    const paymentsCollection = db.collection('payments')
    const usersCollection = db.collection('users'); // ✅ This line was missing
    

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
      try {
        const id = req.params.id;
    
        const session = await sessionCollection.findOne({ _id: new ObjectId(id) });
    
        if (!session) {
          return res.status(404).send({ message: 'Session not found' });
        }
    
        res.send(session);
      } catch (err) {
        console.error('Error fetching session:', err);
        res.status(500).send({ message: 'Server error' });
      }
    });
    
    app.post('/create-payment-intent', async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, 
        currency: 'bdt',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

   // Get a user by email
   app.get('/users/:email', async (req, res) => {
    const { email } = req.params;
    console.log('📡 Looking for user:', email); // ✅ add this
    const user = await usersCollection.findOne({ email });
    console.log('✅ Found user:', user); // ✅ log the result
    res.send(user);
  });
  
  
// ✅ Save new user to DB
app.post('/users', async (req, res) => {
  try {
    const user = req.body;
    console.log('📥 Saving new user:', user); // ✅

    const existingUser = await usersCollection.findOne({ email: user.email });
    if (existingUser) {
      return res.status(400).send({ message: 'User already exists' });
    }

    const result = await usersCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    console.error('❌ Error saving user:', error.message);
    res.status(500).send({ message: 'Failed to save user' });
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
    app.post('/bookedSessions', async (req, res) => {
      try {
        const booking = req.body;

        const existingBooking = await bookedSessionCollection.findOne({
          studentEmail: booking.studentEmail,
          sessionId: booking.sessionId,
        });
        if (existingBooking) {
          return res.status(400).send({ message: 'Session already booked by this student' });
        }
        const result = await bookedSessionCollection.insertOne(booking);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error booking session' });
      }
    });

    // ✅ Get all booked sessions for a user
    app.get('/bookedSessions', async (req, res) => {
      const  email  = req.query.email;

      if (!email) {
        return res.status(400).send({ message: 'Missing email in query parameters' });
      }
      try {
        const sessions = await bookedSessionCollection.find({ studentEmail: email }).toArray();
        res.send(sessions);
      } catch (error) {
        console.error('Error fetching booked sessions:', error.message);
        res.status(500).send({ message: 'Error fetching booked sessions' });
      }
    });


    app.get('/payments', async (req, res) => {
      try {
       
        const userEmail = req.query.email;
    
     
        const query = {};
        if (userEmail) {
          query.email = userEmail;
        }
    
       
        const options = {
          sort: { paid_at: -1 } 
        };
    
        const payments = await paymentsCollection.find(query, options).toArray();
        res.send(payments);
      } catch (error) {
        console.error('❌ Error fetching payments:', error);
        res.status(500).send({ message: 'Failed to fetch payments' });
      }
    });
    

    app.post('/payments', async (req, res) => {
      try {
        const { sessionId, email, amount, paymentMethod, transactionId } = req.body;
    
        // 1️⃣ Update the corresponding booked session's payment status
        const updateResult = await bookedSessionCollection.updateOne(
          {
            sessionId: sessionId,
            studentEmail: email,
          },
          {
            $set: {
              payment_status: 'paid',
              transactionId,
            }
          }
        );
    
        if (updateResult.modifiedCount === 0) {
          return res.status(404).send({ message: 'Booking not found or already updated' });
        }
    
        // 2️⃣ Save payment record in a separate collection
        const paymentDoc = {
          sessionId,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at_string: new Date().toISOString(),
          paid_at: new Date()
        };
    
        const paymentResult = await paymentsCollection.insertOne(paymentDoc);
    
        res.send({
          message: 'Payment recorded and booking updated successfully',
          paymentId: paymentResult.insertedId
        });
      } catch (error) {
        console.error('❌ Error in /payments:', error);
        res.status(500).send({ message: 'Failed to record payment' });
      }
    });
    
 
// app.get('/bookedSessions/:id', async (req, res) => {

//   try {
//     const id = req.params.id;

   

//     const booking = await bookedSessionCollection.findOne({ _id: new ObjectId(id) });

//     if (!booking) {
//       return res.status(404).send({ message: 'Booking not found' });
//     }

//     res.send(booking);
//   } catch (err) {
//     console.error('Error fetching booking:', err);
//     res.status(500).send({ message: 'Server error' });
//   }
// });


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
