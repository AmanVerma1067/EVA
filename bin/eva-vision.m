#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        setbuf(stdout, NULL);
        setbuf(stderr, NULL);

        if (argc < 2) {
            printf("[]\n");
            return 0;
        }

        NSString *imagePath = [NSString stringWithUTF8String:argv[1]];
        if (![[NSFileManager defaultManager] fileExistsAtPath:imagePath]) {
            printf("[]\n");
            return 0;
        }

        NSURL *imageURL = [NSURL fileURLWithPath:imagePath];
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithURL:imageURL options:@{}];

        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        request.usesLanguageCorrection = YES;

        NSError *error = nil;
        [handler performRequests:@[request] error:&error];
        if (error) {
            printf("[]\n");
            return 0;
        }

        NSMutableArray *results = [NSMutableArray array];
        for (VNRecognizedTextObservation *obs in request.results) {
            VNRecognizedText *topCandidate = [[obs topCandidates:1] firstObject];
            if (topCandidate && topCandidate.string.length > 0) {
                CGRect box = obs.boundingBox;
                NSDictionary *item = @{
                    @"text": topCandidate.string,
                    @"confidence": @(topCandidate.confidence),
                    @"x": @(box.origin.x),
                    @"y": @(box.origin.y),
                    @"width": @(box.size.width),
                    @"height": @(box.size.height)
                };
                [results addObject:item];
            }
        }

        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        NSString *jsonStr = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        printf("%s\n", jsonStr.UTF8String ?: "[]");
    }
    return 0;
}

