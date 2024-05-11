globalThis.parseEegBytes = function () {
    var dataLength;
    var data = [];
    var init = function () {
        data = ["aa", "aa"];
        dataLength = undefined;
        classType = undefined;
        param = { data: [] };
    };
    var next = 'type';
    var classType;
    var param = { data: [] };
    var tempQualitySecond;
    var perBrainData = [];
    var tempQuality;
    var quality;
    var qualitySecond;
    var brainData256 = [];
    var continiousMsgs = [];
    var setContinious = function (type) {
        continiousMsgs.forEach(function (msg) { return msg.type = type; });
        continiousMsgs.length = 0;
    };
    var parseBytes = function (bytes) {
        var messages = [];
        bytes.forEach(function (_byte) {
            // 变为 const
            var byte = _byte;
            var msg = { byte: byte };
            messages.push(msg);
            continiousMsgs.push(msg);
            // 1. 报文收集
            if (byte === "aa" && data.slice(-1)[0] === "aa") {
                var heads = continiousMsgs.slice(-2);
                continiousMsgs.length = 0;
                continiousMsgs.push.apply(continiousMsgs, heads);
                // 收到报文头
                init();
            }
            else {
                // 收到报文数据
                data.push(byte);
            }
            // 2. 报文解析
            if ("".concat(data[0]).concat(data[1]) !== 'aaaa') {
                // 报文头未收全, 跳过
            }
            else if (data.length < 3) {
                // aa aa
                setContinious("sync");
            }
            else if (data.length < 5) {
                // aa aa ${time time}
                setContinious("time");
            }
            else if (data.length === 5) {
                dataLength = parseInt(byte, 16);
                setContinious("len");
            }
            else if (data.length === 6) {
                classType = byte;
                next = "type";
                setContinious("class");
            }
            else if (typeof dataLength !== 'number') {
                throw new Error("没有读到长度");
            }
            else if (data.length - 5 < dataLength + 1) {
                if (classType !== "23") {
                    // 非脑电数据, 跳过
                    setContinious(undefined);
                }
                else if (next === "type") {
                    next = "len";
                    param.type = byte;
                    setContinious("type");
                }
                else if (next === "len") {
                    next = "param";
                    param.len = parseInt(byte, 16);
                    setContinious("typeLen");
                }
                else if (next !== "param") {
                    throw new Error("未知状态");
                }
                else {
                    param.data.push(byte);
                    if (param.data.length === param.len) {
                        next = "type";
                        if (param.type === "01") {
                            tempQuality = parseInt(byte, 16);
                            tempQualitySecond = getCurrentSecond(data);
                            setContinious("quality");
                        }
                        else if (param.type === "04") {
                            // param.data 解析为1/2 param.data.length 个双字节小端有符号整数
                            for (var i = 0; i < param.data.length; i += 2) {
                                var _a = param.data.slice(i, i + 2), byte0 = _a[0], byte1 = _a[1];
                                var value = toLittle(byte0, byte1) - 0x2000;
                                perBrainData.push(value);
                            }
                            setContinious("brain");
                        }
                        else {
                            setContinious(undefined);
                        }
                        param = { data: [] };
                    }
                }
            }
            else if (data.length - 5 === dataLength + 1) {
                setContinious("check");
                if (classType !== "23") {
                    // 非脑电数据, 跳过
                }
                else {
                    var checksum = parseInt(byte, 16);
                    // data 6~-1 位累加后低 8 位取反
                    var calcChecksum = (data
                        .slice(5, -1)
                        .reduce(function (acc, cur) { return acc + parseInt(cur, 16); }, 0) &
                        0xff) ^
                        0xff;
                    if (calcChecksum === checksum) {
                        // 校验通过, 暂存脑电数据和信号质量
                        if (typeof tempQuality === "number") {
                            msg.log = ("\u8BFB\u5230\u4FE1\u53F7\u8D28\u91CF: ".concat(tempQuality));
                            log('brain-data', "读到信号质量", tempQuality);
                            quality = tempQuality;
                            qualitySecond = tempQualitySecond;
                            tempQuality = undefined;
                            tempQualitySecond = undefined;
                        }
                        brainData256.push.apply(brainData256, perBrainData);
                        // const currentSecond = getCurrentSecond(data);
                        // const currentQuality = currentSecond === qualitySecond ? quality : undefined;
                        if (typeof quality === "number") {
                            while (brainData256.length >= 256) {
                                msg.log = "\u8BFB\u5230\u8111\u7535\u6570\u636E: ".concat(brainData256.length, " \u4E2A, \u4FE1\u53F7\u8D28\u91CF: ").concat(quality);
                                brainData256.splice(0, 256);
                            }
                        }
                    }
                    else {
                        msg.log = "\u6821\u9A8C\u5931\u8D25, \u8BA1\u7B97\u6821\u9A8C\u548C\u4E3A ".concat(calcChecksum, ", \u6536\u5230\u6821\u9A8C\u548C\u4E3A ").concat(checksum);
                    }
                    perBrainData = [];
                }
            }
            else {
            }
        });
        return messages;
    };
    return parseBytes;
};
var toLittle = function () {
    var bytes = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        bytes[_i] = arguments[_i];
    }
    var dv = new DataView(new Uint8Array(bytes.map(function (byte) { return parseInt(byte, 16); })).buffer);
    return dv.getInt16(0, true);
};
var getCurrentSecond = function (data) {
    var _a = data.slice(2, 4), byte0 = _a[0], byte1 = _a[1];
    return toLittle(byte0, byte1);
};
var log = function () {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
};
var pendingPromise = function () {
    var resolve = function (v) { };
    var reject = function (e) { };
    var pending = new Promise(function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return resolve = args[0], reject = args[1], args;
    });
    if (resolve && reject) {
        return [pending, resolve, reject];
    }
    else {
        throw new Error();
    }
};
