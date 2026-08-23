/**
 * Effects index — registro central de effects que el plugin expone.
 */

'use strict';

const effects = {
    static: require('./static'),
    breathing: require('./breathing'),
    wave: require('./wave'),
    reactive: require('./reactive'),
};

module.exports = effects;
