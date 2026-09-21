#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>
#import <signal.h>
#import <stdio.h>
#import <unistd.h>

static volatile sig_atomic_t g_running = 1;

static void handleSignal(int sig) {
    g_running = 0;
}

static NSString *transcribeAudioFile(NSString *filePath, NSString *localeIdentifier) {
    if (![[NSFileManager defaultManager] fileExistsAtPath:filePath]) {
        return @"";
    }
    
    NSURL *url = [NSURL fileURLWithPath:filePath];
    NSLocale *locale = [NSLocale localeWithLocaleIdentifier:localeIdentifier ?: @"en-US"];
    SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:locale];
    if (!recognizer || !recognizer.isAvailable) {
        recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale currentLocale]];
    }
    if (!recognizer) {
        return @"";
    }
    
    SFSpeechURLRecognitionRequest *request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:url];
    request.shouldReportPartialResults = NO;
    
    __block BOOL done = NO;
    __block NSString *transcript = @"";
    
    [recognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
        if (error) {
            done = YES;
            return;
        }
        if (result.isFinal) {
            transcript = result.bestTranscription.formattedString ?: @"";
            done = YES;
        }
    }];
    
    NSDate *timeout = [NSDate dateWithTimeIntervalSinceNow:8.0];
    while (!done && [timeout timeIntervalSinceNow] > 0) {
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }
    
    return transcript;
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        setbuf(stdout, NULL);
        setbuf(stderr, NULL);
        
        signal(SIGINT, handleSignal);
        signal(SIGTERM, handleSignal);
        signal(SIGPIPE, handleSignal);
        
        NSArray *args = [[NSProcessInfo processInfo] arguments];
        NSString *mode = args.count > 1 ? args[1] : @"--listen";
        
        if ([mode isEqualToString:@"--transcribe"]) {
            if (args.count < 3) {
                fprintf(stderr, "Usage: eva-voice-capture --transcribe <file.wav>\n");
                return 1;
            }
            NSString *file = args[2];
            NSString *text = transcribeAudioFile(file, @"en-US");
            printf("TRANSCRIPT: %s\n", text.UTF8String);
            return 0;
        }
        
        NSString *wavPath = nil;
        BOOL isTemp = NO;
        
        if ([mode isEqualToString:@"--record"] && args.count > 2) {
            wavPath = args[2];
        } else {
            isTemp = YES;
            wavPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"eva_audio_%u.wav", arc4random()]];
        }
        
        NSURL *url = [NSURL fileURLWithPath:wavPath];
        NSDictionary *settings = @{
            AVFormatIDKey: @(kAudioFormatLinearPCM),
            AVSampleRateKey: @(16000.0),
            AVNumberOfChannelsKey: @(1),
            AVLinearPCMBitDepthKey: @(16),
            AVLinearPCMIsFloatKey: @(NO),
            AVLinearPCMIsBigEndianKey: @(NO)
        };
        
        NSError *recError = nil;
        AVAudioRecorder *recorder = [[AVAudioRecorder alloc] initWithURL:url settings:settings error:&recError];
        if (recError || !recorder) {
            fprintf(stderr, "ERROR: Recorder failed to initialize: %s\n", recError.localizedDescription.UTF8String ?: "Unknown");
            return 1;
        }
        
        if (![recorder record]) {
            fprintf(stderr, "ERROR: Failed to start recording.\n");
            return 1;
        }
        
        printf("RECORDING_STARTED\n");
        
        // Asynchronous thread to monitor stdin
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            char buffer[64];
            ssize_t n = read(STDIN_FILENO, buffer, sizeof(buffer));
            (void)n;
            g_running = 0;
        });
        
        NSDate *maxDuration = [NSDate dateWithTimeIntervalSinceNow:25.0];
        while (g_running && [maxDuration timeIntervalSinceNow] > 0) {
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        
        [recorder stop];
        printf("RECORDING_STOPPED\n");
        
        if ([mode isEqualToString:@"--record"]) {
            printf("SAVED: %s\n", wavPath.UTF8String);
            return 0;
        }
        
        // Mode is --listen: transcribe now
        printf("TRANSCRIBING\n");
        NSString *transcript = transcribeAudioFile(wavPath, @"en-US");
        printf("TRANSCRIPT: %s\n", transcript.UTF8String);
        
        if (isTemp) {
            [[NSFileManager defaultManager] removeItemAtPath:wavPath error:nil];
        }
    }
    return 0;
}
