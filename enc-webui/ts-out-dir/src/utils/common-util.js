export default {
    getWeek() {
        return `星期${'日一二三四五六'.charAt(new Date().getDay())}`;
    },
    mobilePhone(str) {
        const reg = /^0?1[0-9]{10}$/;
        return reg.test(str);
    },
    toSplitNumFor(num, numToSpace) {
        return num.replace(/(.{4})/g, '$1 ');
    },
    bankCardNo(str) {
        const reg = /^\d{15,20}$/;
        return reg.test(str);
    },
    regEmail(str) {
        const reg = /^([a-zA-Z]|[0-9])(\w|-)+@[a-zA-Z0-9]+\.([a-zA-Z]{2,4})$/;
        return reg.test(str);
    },
    idCardNumber(str) {
        const reg = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/;
        return reg.test(str);
    },
    deleteArrItem(arr, arrItem) {
        arr.splice(arr.indexOf(arrItem), 1);
    },
    arrToRepeat(arr) {
        return arr.filter((ele, index, thisArr) => {
            return thisArr.indexOf(ele) === index;
        });
    },
    deRepeatArr(seriesArr) {
        return [...new Set(seriesArr)];
    },
    byArrObjDeleteArrObj2(arrObj, arrObj2, objKey) {
        arrObj
            .map((value) => {
            return value[objKey];
        })
            .forEach((value2) => {
            arrObj2.splice(arrObj2.findIndex((item) => item[objKey] === value2), 1);
        });
        return arrObj2;
    },
    deleteArrObjByKey(arrObj, objKey, value) {
        arrObj.splice(arrObj.findIndex((item) => item[objKey] === value), 1);
        return arrObj;
    },
    findArrObjByKey(arrObj, objKey, value) {
        return arrObj[arrObj.findIndex((item) => item[objKey] == value)];
    },
    byArrObjFindArrObj2(arrObj, arrObj2, objKey) {
        const arrObj3 = [];
        arrObj
            .map((value) => {
            return value[objKey];
        })
            .forEach((value2) => {
            const arrIndex = arrObj2.findIndex((item) => item[objKey] === value2);
            if (arrIndex !== -1) {
                arrObj3.push(arrObj2[arrIndex]);
            }
        });
        return arrObj3;
    }
};
