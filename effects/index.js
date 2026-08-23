/**
 * Effects index — registro central de effects que el plugin expone.
 */

'use strict';

const effects = {
    static: require('./static'),
    breathing: require('./breathing'),
    wave: require('./wave'),
    reactive: require('./reactive'),
    typing_reactive: require('./typing_reactive'),
};

module.exports = effects;
