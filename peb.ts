

globalThis.parseEegBytes = () => {
    let dataLength: number | undefined;
    let data: string[] = [];
    const init = () => {
        data = ["aa", "aa"];
        dataLength = undefined;
        classType = undefined;
        param = { data: [] };
    };
    let next: | 'type' | 'len' | 'param' = 'type';
    let classType: string | undefined;
    let param: { type?: string; len?: number; data: string[] } = { data: [] };
    let tempQualitySecond: number | undefined;
    let perBrainData: number[] = [];
    let tempQuality: number | undefined;
    let quality: number | undefined;
    let qualitySecond: number | undefined;
    const brainData256: number[] = [];
    type Msg = { type?: "sync" | "time" | "len" | "class" | "type" | "typeLen" | 'check' | 'brain' | 'quality'; byte: string; log?: string };
    const continiousMsgs: Msg[] = [];
    const setContinious = (type: Msg['type']) => {
        continiousMsgs.forEach(msg => msg.type = type);
        continiousMsgs.length = 0;
    }
    const parseBytes = (bytes: string[]) => {
        const messages: Msg[] = [];
        bytes.forEach(_byte => {
            // 变为 const
            const byte = _byte;
            const msg: Msg = { byte };
            messages.push(msg);
            continiousMsgs.push(msg);
            // 1. 报文收集
            if (byte === "aa" && data.slice(-1)[0] === "aa") {
                const heads = continiousMsgs.slice(-2);
                continiousMsgs.length = 0;
                continiousMsgs.push(...heads);
                // 收到报文头
                init();
            } else {
                // 收到报文数据
                data.push(byte);
            }
            // 2. 报文解析
            if (`${data[0]}${data[1]}` !== 'aaaa') {
                // 报文头未收全, 跳过
            } else if (data.length < 3) {
                // aa aa
                setContinious("sync");
            } else if (data.length < 5) {
                // aa aa ${time time}
                setContinious("time");
            } else if (data.length === 5) {
                dataLength = parseInt(byte, 16);
                setContinious("len");
            } else if (data.length === 6) {
                classType = byte;
                next = "type";
                setContinious("class");
            } else if (typeof dataLength !== 'number') {
                throw new Error("没有读到长度");
            } else if (data.length - 5 < dataLength + 1) {
                if (classType !== "23") {
                    // 非脑电数据, 跳过
                    setContinious(undefined);
                } else if (next === "type") {
                    next = "len";
                    param.type = byte;
                    setContinious("type");
                } else if (next === "len") {
                    next = "param";
                    param.len = parseInt(byte, 16);
                    setContinious("typeLen");
                } else if (next !== "param") {
                    throw new Error("未知状态");
                } else {
                    param.data.push(byte);
                    if (param.data.length === param.len) {
                        next = "type"
                        if (param.type === "01") {
                            tempQuality = parseInt(byte, 16);
                            tempQualitySecond = getCurrentSecond(data);
                            setContinious("quality");
                        } else if (param.type === "04") {
                            // param.data 解析为1/2 param.data.length 个双字节小端有符号整数
                            for (let i = 0; i < param.data.length; i += 2) {
                                const [byte0, byte1] = param.data.slice(i, i + 2);
                                const value = toLittle(byte0, byte1) - 0x2000;
                                perBrainData.push(value);
                            }
                            setContinious("brain");
                        } else {
                            setContinious(undefined);
                        }
                        param = { data: [] };
                    }
                }
            } else if (data.length - 5 === dataLength + 1) {
                setContinious("check");
                if (classType !== "23") {
                    // 非脑电数据, 跳过
                } else {
                    const checksum = parseInt(byte, 16);
                    // data 6~-1 位累加后低 8 位取反
                    const calcChecksum =
                        (data
                            .slice(5, -1)
                            .reduce((acc, cur) => acc + parseInt(cur, 16), 0) &
                            0xff) ^
                        0xff;
                    if (calcChecksum === checksum) {
                        // 校验通过, 暂存脑电数据和信号质量
                        if (typeof tempQuality === "number") {
                            msg.log = (`读到信号质量: ${tempQuality}`);
                            log('brain-data', "读到信号质量", tempQuality);
                            quality = tempQuality;
                            qualitySecond = tempQualitySecond;
                            tempQuality = undefined;
                            tempQualitySecond = undefined;
                        }
                        brainData256.push(...perBrainData);
                        // const currentSecond = getCurrentSecond(data);
                        // const currentQuality = currentSecond === qualitySecond ? quality : undefined;
                        if (typeof quality === "number") {
                            while (brainData256.length >= 256) {
                                msg.log = `读到脑电数据: ${brainData256.length} 个, 信号质量: ${quality}`;
                                brainData256.splice(0, 256);
                            }
                        }
                    } else {
                        msg.log = `校验失败, 计算校验和为 ${calcChecksum}, 收到校验和为 ${checksum}`;
                    }
                    perBrainData = [];
                }
            } else {

            }
        });
        return messages
    };
    return parseBytes;
};

const toLittle = (...bytes: string[]) => {
    const dv = new DataView(new Uint8Array(bytes.map(byte => parseInt(byte, 16))).buffer);
    return dv.getInt16(0, true);
}

const getCurrentSecond = (data: string[]) => {
    const [byte0, byte1] = data.slice(2, 4);
    return toLittle(byte0, byte1);
}

const log = (...args: any[]) => { };

const pendingPromise = <T>() => {
    let resolve = (v: T) => { };
    let reject = (e: Error) => { };
    const pending = new Promise<T>((...args) => [resolve, reject] = args);
    if (resolve && reject) {
        return [pending, resolve, reject] as const;
    } else {
        throw new Error();
    }
};