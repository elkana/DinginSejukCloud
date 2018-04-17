module.exports.OrderException = function (message) {
    this.name = 'OrderException';
    this.message = message;
    this.stack = (new Error()).stack;
}

