import { jsErrorCollection } from 'js-error-collection';
import pack from '../../package.json';
import settings from '@/settings';
import bus from '@/utils/bus';
import axiosReq from '@/utils/axios-req';
const reqUrl = '/integration-front/errorCollection/insert';
const errorLogReq = (errLog) => {
    axiosReq({
        url: reqUrl,
        data: {
            pageUrl: window.location.href,
            errorLog: errLog,
            browserType: navigator.userAgent,
            version: pack.version
        },
        method: 'post'
    }).then(() => {
        bus.emit('reloadErrorPage', {});
    });
};
export const useErrorLog = () => {
    if (settings.errorLog?.includes(import.meta.env.VITE_APP_ENV)) {
        jsErrorCollection({ runtimeError: true, rejectError: true, consoleError: true }, (errLog) => {
            if (!errLog.includes(reqUrl))
                errorLogReq(errLog);
        });
    }
};
