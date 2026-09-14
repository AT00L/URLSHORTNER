import jwt from "jsonwebtoken"
const jwtPrivatekey = process.env.JWT_PRIVATE_KEY

export function authorize(req, res, next) {
    if (req.token) {
        try {
            let user = jwt.verify(req.token, jwtPrivatekey)
            req.user = user._doc
        }
        catch (error) {
            console.log(error)
            return res.redirect("/login")
        }
    }
    else {
        return res.redirect("/login")
    }
    next()
}

export function homePageCheck(req, res, next) {
    if (req.token) {
        try {
            jwt.verify(req.token, jwtPrivatekey)
            return res.redirect("/shorten")
        }
        catch (error) {
            console.log(error)
        }
    }
    next()
}