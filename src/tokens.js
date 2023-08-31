import {ExternalTokenizer} from "@lezer/lr"
import {commentContent as cmntContent} from "./parser.terms.js";

const lessThan = 60, greaterThan = 62, slash = 47, question = 63, bang = 33, dash = 45

export const commentContent = new ExternalTokenizer(input => {
    for (let dashes = 0, i = 0;; i++) {
        if (input.next < 0) {
            if (i) input.acceptToken(cmntContent)
            break
        }
        if (input.next == dash) {
            dashes++
        } else if (input.next == greaterThan && dashes >= 2) {
            if (i > 3) input.acceptToken(cmntContent, -2)
            break
        } else {
            dashes = 0
        }
        input.advance()
    }
})