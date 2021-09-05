export const plurality = (word: string, amount: number): string => {
    if(amount === 1) {
        return word;
    }

    if(word.endsWith('s')) {
        return `${word}'`;
    } else {
        return `${word}s`;
    }
};
