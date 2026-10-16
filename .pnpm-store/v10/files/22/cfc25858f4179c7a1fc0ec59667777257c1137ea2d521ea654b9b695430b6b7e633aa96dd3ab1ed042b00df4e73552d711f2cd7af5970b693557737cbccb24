// colyseus.js@0.16.22
'use strict';

exports.CloseCode = void 0;
(function (CloseCode) {
    CloseCode[CloseCode["CONSENTED"] = 4000] = "CONSENTED";
    CloseCode[CloseCode["DEVMODE_RESTART"] = 4010] = "DEVMODE_RESTART";
})(exports.CloseCode || (exports.CloseCode = {}));
class ServerError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "ServerError";
        this.code = code;
    }
}
class AbortError extends Error {
    constructor(message) {
        super(message);
        this.name = "AbortError";
    }
}

exports.AbortError = AbortError;
exports.ServerError = ServerError;
//# sourceMappingURL=Errors.js.map
