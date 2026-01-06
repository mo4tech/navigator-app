import { getLangNameFromCode } from 'language-name-map';
import localeEmoji from 'locale-emoji';
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import I18n from 'react-native-i18n';
import { getAvailableLocales } from '../utils/localize';

I18n.fallbacks = true;
I18n.translations = {
    ...getAvailableLocales(),
};

interface LanguageContextProps {
    locale: string;
    setLocale: (locale: string) => void;
    t: (key: string, options?: Record<string, any>) => string;
    current?: any;
    language?: any;
    languages?: any[];
}

const LanguageContext = createContext<LanguageContextProps>({
    locale: 'ar',
    setLocale: () => {},
    t: () => '',
});

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    // Force Arabic language - ignore any stored preference
    const locale = 'ar';

    const languages = Object.keys(I18n.translations).map((code) => {
        return { code, ...getLangNameFromCode(code), emoji: localeEmoji(code) };
    });

    const language = useMemo(() => {
        return { code: locale, ...getLangNameFromCode(locale), emoji: localeEmoji(locale) };
    }, [locale]);

    // Disable language switching - always use Arabic
    const setLocale = (newLocale: string) => {
        // No-op: Language is locked to Arabic
    };

    useEffect(() => {
        // Force Arabic locale
        I18n.locale = 'ar';
    }, []);

    const t = (key: string, options?: Record<string, any>) => I18n.t(key, options);

    return <LanguageContext.Provider value={{ locale, setLocale, t, current: language, language, languages }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
    return useContext(LanguageContext);
};
