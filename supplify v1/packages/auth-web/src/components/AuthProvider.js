"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = AuthProvider;
const react_1 = require("next-auth/react");
function AuthProvider({ children }) {
    return (<react_1.SessionProvider>
      {children}
    </react_1.SessionProvider>);
}
//# sourceMappingURL=AuthProvider.js.map