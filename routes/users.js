var express = require('express');
var router = express.Router();

var Q = require('q');
var request = Q.denodeify(require('request'));
var _ = require('lodash');

var TokenModel = require('./../models/token');
var UserModel = require('./../models/user');

var sendError = require('./../error-formatter');

var generateToken = require('./../utils/generate-token');

router.get('/me', function (req, res, next) {
    var user = req.user;
    user.facebook = undefined;
    return res.json(user);
});

router.post('/login', function(req, res, next) {
    if (!req.body.id || !req.body.token) {
        res.status(400);
        sendError(res, 'Id or token is missing', null, 400);
        return;
    }

    var credentialsPassed = {
        id: req.body.id,
        token: req.body.token
    };

    var userCreated = false;

    var facebookUri = 'https://graph.facebook.com/me?access_token=' + credentialsPassed.token + '&fields=id,name,email,first_name,last_name,picture.type(large)';

    return request(facebookUri).then(function (resp) {

        resp = resp[0];

        var fbResp = JSON.parse(resp.body);

        if (resp.statusCode !== 200) {
            res.status(400);
            sendError(res, 'Token is invalid!', null, 400);
            return;
        }

        if (fbResp.id !== credentialsPassed.id) {
            res.status(400);
            sendError(res, 'Token does not match to the id passed!!', null, 400);
            return;
        }

        return UserModel.findOne({
            'facebook.id': credentialsPassed.id
        }).lean(true).then(function (existingUser) {

            if (!existingUser) {
                var newUser = new UserModel();

                newUser.facebook = {
                    id: credentialsPassed.id,
                    token: credentialsPassed.token
                };

                newUser.email = fbResp.email;
                newUser.firstName = fbResp.first_name;
                newUser.lastName = fbResp.last_name;

                newUser.picture = fbResp.picture.data.url;

                userCreated = true;

                return newUser.saveQ();

            }

            return existingUser;

        }).then(function createToken(user) {

            var expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);

            return generateToken(256).then(function saveToken(token) {
                var tokenModel = new TokenModel({
                    user: user._id,
                    tokenString: token,
                    expiresAt: expiryDate,
                    createdAt: new Date()
                });

                return tokenModel.saveQ();
            });

        }).then(function packageData(token) {

            return res.json({
                token: token.tokenString,
                new: userCreated
            });

        });

    });
});

module.exports = router;
