import { createReactPage } from "openxiangda/runtime";

import App from "./App";

const page = createReactPage(App);

export const mount = page.mount;
export const update = page.update;
export const unmount = page.unmount;
export default page;
