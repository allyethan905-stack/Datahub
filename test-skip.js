const skip = "0";
console.log(skip ? Number(skip) : undefined);

const skip2 = undefined;
console.log(skip2 ? Number(skip2) : undefined);

const skip3 = "NaN";
console.log(skip3 ? Number(skip3) : undefined);
