import jwt from 'jsonwebtoken';

export const generateTokenAndSetCookie = (UserId,res) => {
    const token = jwt.sign({UserId},process.env.JWT_SECRET,{
        expiresIn: '15d',
    });

    res.cookie("jwt",token,{
        maxAge: 15*24*60*60*1000,//MS
        httpOnly:true, //prevent XSS attacks cross-site scripting attacks
        sameSite: "strict", // CSRF ATTACKS cross-site request forgery  attacks
        secure:process.env.NODE_ENV !== "development",
    });
};  