const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
app.use(cors());
app.use(express.json());


const port = process.env.PORT || 5001;

const decodedKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')


const serviceAccount = JSON.parse(decodedKey)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
    // await client.connect();

    const db = client.db('studySessionDB');
    const sessionCollection = db.collection('sessions');
    const reviewCollection = db.collection('reviews');
    const bookedSessionCollection = db.collection('bookedSessions');
    const paymentsCollection = db.collection('payments')
    const usersCollection = db.collection('users'); 
    const notesCollection = db.collection("notes");
    const materialsCollection = db.collection('studyMaterials')

    // custom
    const verifyFBToken = async (req, res, next) => {
     const authHeader = req.headers.authorization

     console.log('🧾 Authorization Header:', authHeader);

     if(!authHeader || !authHeader.startsWith('Bearer ')){
return res.status(401).send({message: 'unauthorized access'})
     }
const token = authHeader.split(' ')[1]
// if(!token){
//   return res.status(401).send({message: 'unauthorized access'})
// }
// verify the token

try{
  const decoded = await admin.auth().verifyIdToken(token)
  req.decoded = decoded;
  console.log('✅ Decoded:', decoded);
  next()
}
catch (error) {
  console.error('❌ Token verification failed:', error.message);
  res.status(401).send({ message: 'Unauthorized: Token verification failed' });
}

     
    }

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
     
      try {
        const { amount } = req.body;
        console.log('📥 Received amount:', amount);

        if (!amount || typeof amount !== 'number' ) {
          return res.status(400).json({ error: 'Invalid amount' });
        }
    
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: 'BDT', // Must be uppercase
          payment_method_types: ['card'],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('❌ Stripe create error:', error); // log actual backend error
    res.status(500).json({ error: error.message });
  }
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
      // Optional: Update login time
      await usersCollection.updateOne(
        { email: user.email },
        { $set: { last_log_in: new Date().toISOString() } }
      );
      return res.status(200).send({ message: 'User already exists, login time updated' });
    }
    user.created_at = new Date().toISOString();
    user.last_log_in = new Date().toISOString();
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
    
        // 1️⃣ Validate required fields
        if (!booking.studentEmail || !booking.sessionId) {
          return res.status(400).send({ message: 'Missing studentEmail or sessionId' });
        }
    
        // 2️⃣ Look up user by email
        const user = await usersCollection.findOne({ email: booking.studentEmail });
    
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
    
        // 3️⃣ Only allow if role is 'student'
        if (user.role !== 'student') {
          return res.status(403).send({ message: 'Only students can book sessions' });
        }
    
        // 4️⃣ Prevent duplicate booking
        const existingBooking = await bookedSessionCollection.findOne({
          studentEmail: booking.studentEmail,
          sessionId: booking.sessionId,
        });
    
        if (existingBooking) {
          return res.status(400).send({ message: 'Session already booked by this student' });
        }
    
        // 5️⃣ Save booking
        const result = await bookedSessionCollection.insertOne(booking);
        res.send(result);
      } catch (error) {
        console.error('❌ Booking error:', error);
        res.status(500).send({ message: 'Error booking session' });
      }
    });
    
    // ✅ Get all booked sessions for a user
    app.get('/bookedSessions', verifyFBToken, async (req, res) => {
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


    app.get('/payments', verifyFBToken, async (req, res) => {

    
      try {
       
        const userEmail = req.query.email;
    console.log('decoded', req.decoded)
    if(req.decoded.email !== userEmail){
      return res.status(403).send({message: 'forbidden access'})
    }
     
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
    

   
    
    
 
app.get('/bookedSessions/:id', async (req, res) => {

  try {
    const id = req.params.id;

   

    const booking = await bookedSessionCollection.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found' });
    }

    res.send(booking);
  } catch (err) {
    console.error('Error fetching booking:', err);
    res.status(500).send({ message: 'Server error' });
  }
});

// backend: POST /payments
app.post('/payments',verifyFBToken, async (req, res) => {
  
  try {

    const { sessionId, email, amount, paymentMethod, transactionId } = req.body;

    // Check if booking already exists
    const existingBooking = await bookedSessionCollection.findOne({
      sessionId,
      studentEmail: email,
    });

    if (!existingBooking) {
      // create the booking first
      const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });

      if (!session) {
        return res.status(404).send({ message: 'Session not found' });
      }

      await bookedSessionCollection.insertOne({
        sessionId,
        sessionTitle: session.title,
        tutorEmail: session.tutorEmail,
        studentEmail: email,
        bookingDate: new Date().toISOString(),
        feePaid: amount,
        payment_status: 'paid',
        transactionId,
      });
    } else {
      // otherwise, update existing booking
      await bookedSessionCollection.updateOne(
        { sessionId, studentEmail: email },
        {
          $set: {
            payment_status: 'paid',
            transactionId,
          }
        }
      );
    }

    // Save payment info
    const paymentDoc = {
      sessionId,
      email,
      amount,
      paymentMethod,
      transactionId,
      paid_at: new Date(),
      paid_at_string: new Date().toISOString(),
    };

    const paymentResult = await paymentsCollection.insertOne(paymentDoc);

    res.send({
      message: 'Payment recorded and booking saved/updated successfully',
      paymentId: paymentResult.insertedId
    });
  } catch (error) {
    console.error('❌ Error in /payments:', error);
    res.status(500).send({ message: 'Failed to record payment' });
  }
});

// Create Note Route
app.post('/notes', async (req, res) => {
  try {
    const note = req.body;
    if (!note.email || !note.title || !note.description) {
      return res.status(400).send({ message: 'All fields are required' });
    }

    const result = await notesCollection.insertOne(note);
    res.status(201).send(result);
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).send({ message: 'Server error' });
  }
});

app.get('/notes', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).send({ message: 'Email is required' });
    }

    const notes = await notesCollection.find({ email }).toArray();
    res.send(notes);
  } catch (err) {
    res.status(500).send({ message: 'Server error' });
  }
});

app.patch('/notes/:id', async (req, res) => {
  const id = req.params.id;
  const { title, description } = req.body;

  try {
    const result = await notesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { title, description } }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Update failed' });
  }
});

app.delete('/notes/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const result = await notesCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Delete failed' });
  }
});

app.get('/materials/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  try {
    const studyMaterials = await materialsCollection.find({ sessionId }).toArray();
    res.send(studyMaterials);
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch studyMaterials' });
  }
});


// ✅ Get all users with role = 'tutor'
app.get('/users', async (req, res) => {
  try {
    const role = req.query.role;

    let query = {};
    if (role) {
      query = { role };
    }

    const users = await usersCollection.find(query).toArray();
    res.send(users);
  } catch (error) {
    console.error('❌ Error fetching users:', error.message);
    res.status(500).send({ message: 'Failed to fetch users' });
  }
});

app.get('/tutors-from-sessions', async (req, res) => {
  try {
    const tutors = await sessionCollection.aggregate([
      {
        $group: {
          _id: '$tutorName',
          tutorName: { $first: '$tutorName' }
        }
      }
    ]).toArray();

    // Optionally add current logged-in tutor if passed as query param
    const { currentTutorName } = req.query;
    const exists = tutors.some(t => t.tutorName === currentTutorName);
    if (currentTutorName && !exists) {
      tutors.push({ tutorName: currentTutorName });
    }

    res.send(tutors);
  } catch (err) {
    console.error('❌ Failed to fetch tutors:', err.message);
    res.status(500).send({ message: 'Internal server error' });
  }
});




// POST /study-sessions
app.post('/study-sessions', async (req, res) => {
  try {
    const session = req.body;

    
    session.status = 'pending';
    session.registrationFee = 0; 

    const result = await sessionCollection.insertOne(session);
    res.send(result);
  } catch (error) {
    console.error('Error creating session:', error.message);
    res.status(500).send({ message: 'Failed to create session' });
  }
});

// PATCH: Update study session status back to 'pending'
app.patch('/study-sessions/request-again/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await sessionCollection.updateOne(
      { _id: new ObjectId(id), status: 'rejected' },
      { $set: { status: 'pending' } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send({ message: 'Already pending or approved' });
    }

    res.send({ message: 'Request sent successfully' });
  } catch (err) {
    res.status(500).send({ message: 'Failed to send request again' });
  }
});

// Get all study sessions created by a tutor
app.get('/study-sessions/tutor/:email', async (req, res) => {
  const email = req.params.email;
  const sessions = await sessionCollection.find({ tutorEmail: email }).toArray();
  res.send(sessions);
});

app.get('/tutor/approved-sessions/:email', async (req, res) => {
  const tutorEmail = req.params.email;
  const sessions = await sessionCollection.find({
    tutorEmail,
    status: 'approved'
  }).toArray();
  res.send(sessions);
});

app.patch('/study-sessions/reject/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { rejectionReason, feedback } = req.body;

    const result = await sessionCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'rejected',
          rejectionReason: rejectionReason || 'No reason provided',
          feedback: feedback || ''
        }
      }
    );

    res.send(result);
  } catch (error) {
    console.error('❌ Error rejecting session:', error);
    res.status(500).send({ message: 'Rejection failed' });
  }
});


app.post('/materials',verifyFBToken, async (req, res) => {
  const material = req.body; 
  material.createdAt = new Date();

  const result = await materialsCollection.insertOne(material);
  res.send(result);
});
app.get('/materials/:tutorEmail', async (req, res) => {
  const tutorEmail = req.params.tutorEmail;
  const materials = await materialsCollection.find({ tutorEmail }).toArray();
  res.send(materials);
});
app.delete('/materials/:id', async (req, res) => {
  const id = req.params.id;
  const result = await materialsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});
app.put('/materials/:id', async (req, res) => {
  const id = req.params.id;
  const updated = req.body;
  const result = await materialsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updated }
  );
  res.send(result);
});

app.get('/users', async (req, res) => {
  const search = req.query.search || '';
  const query = {
    $or: [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ]
  };

  const users = await usersCollection.find(query).toArray();
  res.send(users);
});


app.get("/users/search", async (req, res) => {
  const emailQuery = req.query.email;
  if (!emailQuery) {
    return res.status(400).send({ message: "Unfortunetly Missing email query" });
  }

  const regex = new RegExp(emailQuery, "i");

  try {
    const users = await usersCollection
      .find({ email: { $regex: regex } })
      .project({ name: 1, email: 1, createdAt: 1, role: 1 }) 
      .limit(10)
      .toArray();

    res.send(users);
  } catch (error) {
    console.error("Error searching users", error);
    res.status(500).send({ message: "Error searching users", error });
  }
});


// ✅ Update user role
app.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if(!["admin", "student"].includes(role)){
    return res.status(400).send({ message : "Invalid role"})
  }
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );
  res.send(result);
});

app.patch('/study-sessions/approve/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { registrationFee } = req.body;

    const result = await sessionCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'approved',
          registrationFee: parseInt(registrationFee) || 0
        }
      }
    );

    res.send(result);
  } catch (error) {
    console.error('❌ Error approving session:', error);
    res.status(500).send({ message: 'Approval failed' });
  }
});

app.patch('/study-sessions/reject/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { rejectionReason, feedback } = req.body;
    const result = await sessionCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'rejected',
        rejectionReason,
          feedback
       } }
    );
    res.send(result);
  } catch (error) {
    console.error('❌ Error rejecting session:', error);
    res.status(500).send({ message: 'Rejection failed' });
  }
});

app.put('/study-sessions/:id', async (req, res) => {
  const id = req.params.id;
  const updatedSession = req.body;

  try {
    const existing = await sessionCollection.findOne({ _id: new ObjectId(id) });
    if (!existing || existing.status !== 'approved') {
      return res.status(400).send({ message: 'Only approved sessions can be updated' });
    }

    const result = await sessionCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedSession }
    );

    res.send(result);
  } catch (error) {
    console.error('❌ Update failed:', error);
    res.status(500).send({ message: 'Failed to update session' });
  }
});

app.delete('/study-sessions/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const session = await sessionCollection.findOne({ _id: new ObjectId(id) });
    if (!session || session.status !== 'approved') {
      return res.status(400).send({ message: 'Only approved sessions can be deleted' });
    }

    const result = await sessionCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    console.error('❌ Delete failed:', error);
    res.status(500).send({ message: 'Failed to delete session' });
  }
});

// ✅ Get all study materials (admin)
app.get('/materials', async (req, res) => {
  try {
    const materials = await materialsCollection.find().toArray();
    res.send(materials);
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch all study materials' });
  }
});


    // ✅ Test root route
    
    
    app.get('/', (req, res) => {
      res.send('Study session server is running');
    });

    // ✅ Confirm DB connected
    // await client.db("admin").command({ ping: 1 });
    // console.log("✅ Connected to MongoDB!");

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});