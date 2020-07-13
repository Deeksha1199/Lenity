const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const router = express.Router();
const passportConf = require('../passport');
const passport = require('passport');
const passportJWT = passport.authenticate('jwt', { session: false });
//const keys = require('../../config/keys');
//const verify = require('../../utilities/verify-token');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const GlobalMessage = require('../models/GlobalMessage');

// let jwtUser = null;

// // Token verfication middleware
// router.use(function(req, res, next) {
//     try {
//         jwtUser = jwt.verify(verify(req), keys.secretOrKey);
//         next();
//     } catch (err) {
//         console.log(err);
//         res.setHeader('Content-Type', 'application/json');
//         res.end(JSON.stringify({ message: 'Unauthorized' }));
//         res.sendStatus(401);
//     }
// });

// Get global messages
router.get('/global', (req, res) => {
    GlobalMessage.aggregate([
        {
            $lookup: {
                from: 'profiles',
                localField: 'from',
                foreignField: '_id',
                as: 'fromObj',
            },
        },
    ])
        .project({
            'fromObj.local.password': 0,
            'fromObj.__v': 0,
            'fromObj.date': 0,
        })
        .exec((err, messages) => {
            if (err) {
                console.log(err);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Failure' }));
                res.sendStatus(500);
            } else {
                res.send(messages);
            }
        });
});

// Post global message
router.post('/global', passportJWT, (req, res) => {
    let message = new GlobalMessage({
        from: req.user.id,
        body: req.body.body,
    });

    req.io.sockets.emit('messages', req.body.body);

    message.save(err => {
        if (err) {
            console.log(err);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ message: 'Failure' }));
            res.sendStatus(500);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ message: 'Success' }));
        }
    });
});

// Get conversations list
router.get('/conversations', passportJWT, (req, res) => {
    let from = mongoose.Types.ObjectId(req.user.id);
    Conversation.aggregate([
        {
            $lookup: {
                from: 'profiles',
                localField: 'recipients',
                foreignField: '_id',
                as: 'recipientObj',
            },
        },
    ])
        .match({ recipients: { $all: [{ $elemMatch: { $eq: from } }] } })
        .project({
            'recipientObj.local.password': 0,
            'recipientObj.__v': 0,
            'recipientObj.date': 0,
        })
        .exec((err, conversations) => {
            if (err) {
                console.log(err);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Failure' }));
                res.sendStatus(500);
            } else {
                res.send(conversations);
            }
        });
});

// Get messages from conversation
// based on to & from
router.get('/conversations/query', passportJWT, (req, res) => {
    let user1 = mongoose.Types.ObjectId(req.user.id);
    let user2 = mongoose.Types.ObjectId(req.query.userId);
    Message.aggregate([
        {
            $lookup: {
                from: 'profiles',
                localField: 'to',
                foreignField: '_id',
                as: 'toObj',
            },
        },
        {
            $lookup: {
                from: 'profiles',
                localField: 'from',
                foreignField: '_id',
                as: 'fromObj',
            },
        },
    ])
        .match({
            $or: [
                { $and: [{ to: user1 }, { from: user2 }] },
                { $and: [{ to: user2 }, { from: user1 }] },
            ],
        })
        .project({
            'toObj.local.password': 0,
            'toObj.__v': 0,
            'toObj.date': 0,
            'fromObj.local.password': 0,
            'fromObj.__v': 0,
            'fromObj.date': 0,
        })
        .exec((err, messages) => {
            if (err) {
                console.log(err);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Failure' }));
                res.sendStatus(500);
            } else {
                res.send(messages);
            }
        });
});

// Post private message
router.post('/', passportJWT, (req, res) => {
    let from = mongoose.Types.ObjectId(req.user.id);
    let to = mongoose.Types.ObjectId(req.body.to);

    Conversation.findOneAndUpdate(
        {
            recipients: {
                $all: [
                    { $elemMatch: { $eq: from } },
                    { $elemMatch: { $eq: to } },
                ],
            },
        },
        {
            recipients: [req.user.id, req.body.to],
            lastMessage: req.body.body,
            date: Date.now(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
        function(err, conversation) {
            if (err) {
                console.log(err);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Failure' }));
                res.sendStatus(500);
            } else {
                let message = new Message({
                    conversation: conversation._id,
                    to: req.body.to,
                    from: req.user.id,
                    body: req.body.body,
                });

                req.io.sockets.emit('messages', req.body.body);

                message.save(err => {
                    if (err) {
                        console.log(err);
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ message: 'Failure' }));
                        res.sendStatus(500);
                    } else {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(
                            JSON.stringify({
                                message: 'Success',
                                conversationId: conversation._id,
                            })
                        );
                    }
                });
            }
        }
    );
});

module.exports = router;
